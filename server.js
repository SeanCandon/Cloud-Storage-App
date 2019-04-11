var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser());
var fs = require('fs');
var url = require('url');
var html = require('html');
var firebase = require('firebase-admin')
var assert = require('assert');
const {google} = require('googleapis');
const path = require('path');
const http = require('http');
const opn = require('opn');
const config = require('./auth.json');
var request = require('request');

/*
Initialize firebase database using the json file containing
firebase credentials.
*/

/*
Use config file 'auth.json' (imported above) for service
account google drive authorization
*/
const jwtClient = new google.auth.JWT(
 config.client_email,
 null,
 config.private_key,
 ['https://www.googleapis.com/auth/drive'],
 null
);
jwtClient.authorize((authErr) => {
 if (authErr) {
   console.log(authErr);
   return;
 }
});

const userRef = database.ref('/users/'); // database reference to users
const groupRef = database.ref('/groups/'); // database reference to groups

/*
Handles requests from client to create a new user in
the database. Each new user in the database has a username,
password, and public key
*/
app.post('/newuser', function(req, res) {

  //read info from client's POST request
  var publicKey = req.body.publicKey;
  var user = req.body.username;
  var pass = req.body.password;

  //creare new user in database
  database.ref('/users/' + user).set({
    publickey: publicKey,
    username: user,
    password: pass
  });
});


/*
Handles request to check if a user already exists in the database,
returning a boolean.
*/
app.post('/checkuser', function(req, res) {

  var user = req.body.username;
  var pass = req.body.password;

  userRef.once('value', function(snapshot) {
    var b = 1; //set boolean return val to be true
    if(snapshot.hasChild(user)){
      b = 0; // if user already exists set return value to false
    }
    /*
    Send post request back to client with username and password as well
    as the boolean value. This will allow the client to determine whether or
    not to generate a new key pair
    */
    request.post(
        'http://localhost:8080/newuserlogin',
        { json: { b: b,
                  username: user,
                  password: pass } },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log(body);
            }
        }
    );
  });

});

/*
Checks whether or not the user's login attempt is valid,
by checking whether or not that username and password already
exist. Returns a boolean
*/
app.post('/olduser', function(req, res) {

  var user = req.body.username;
  var pass = req.body.password;

  userRef.once('value', function(snapshot) {
    // if a user with that name exists
    if(snapshot.hasChild(user)){
      var usrn = snapshot.child(user).val().username;
      var pswd = snapshot.child(user).val().password;
      var u = usrn.localeCompare(user); //compare usernames
      var p = pswd.localeCompare(pass); //compare passwords
      if (u != 0 || p != 0){ // if name and password don't match
        request.post(
            'http://localhost:8080/login',
            { json: { b: 0 } }, // return false
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(body);
                }
            }
        );
      }
      else{ // if username and password is valid
        request.post(
            'http://localhost:8080/login',
            { json: { b: 1 } }, // return true
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(body);
                }
            }
        );

      }
    }
    else{ // if no user with that name is found
      request.post(
          'http://localhost:8080/login',
          { json: { b: 0 } }, // return false
          function (error, response, body) {
              if (!error && response.statusCode == 200) {
                  console.log(body);
              }
          }
      );
    }
  });
});

/*
Returns to a specified destination in the client a user's
own encrypted version of the symmetric key of a certain group.
The decryption is handled by the client. The server never sees
a decrypted key.
*/
app.post('/sendsymmkey', function(req, res) {

  var user = req.body.user;
  var groupchoice = req.body.group;
  var dest = req.body.destination;

  groupRef.once('value', function(snapshot) {
    if(snapshot.hasChild(groupchoice)){
      var users = snapshot.child(groupchoice).child("users");
      if(users.hasChild(user)){
        /*get user's version of the symmetric key (encrypted with their own
          public key) from the group in the database
        */
        var symm = users.child(user).val().symmetrickey;
        request.post(
            'http://localhost:8080/newupload',
            { json: { symmkey: symm } }, // return encrypted symmetric key
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(body);
                }
            }
        );

      }
    }
  })

});

/*
Uploads an encrypted file to a certain group. This is all done in
the function uploadFile, defined later.
*/
app.post('/upload', function(req, res) {
    var filename = req.body.file;
    var enc = req.body.enc;
    var groupchoice = req.body.group;
    uploadFile(filename, enc, groupchoice);
});

/*
Returns a user's public key from the database
*/
app.post('/sendpubkey', function(req, res) {

  var user = req.body.user;

  var pubkey = "";
  userRef.once('value', function(snapshot1) {
    if(snapshot1.hasChild(user)){
      pubkey = snapshot1.child(user).val().publickey;
    }
    request.post(
        'http://localhost:8080/getpubkey',
        { json: { pubkey: pubkey } },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log(body);
            }
        }
    );
  });
});


/*
Creates a new group in the database and a new folder in the drive. Saved in
the database is the creator's version of the group's symmetric key, as well as
an id, which identifies the corresponding drive folder. Also stored n the
database is whether or not the user is the owner of the group (which they
obviously are in this case). Returns whether or not the group has been
created.
*/
app.post('/created', function(req, res) {
  var group = req.body.groupname;
  var symmEnc = req.body.symmenc;
  var user = req.body.user;

  var b = 0;

  groupRef.once('value', function(snapshot) {
    if(snapshot.hasChild(group)){
      b = 0;
    }
    else{
      b = 1;

      var fileMetadata = {
      name: group,
      mimeType: 'application/vnd.google-apps.folder',
      parents: homeFolder
      };
      drive.files.create({
        auth: jwtClient,
        resource: fileMetadata,
        fields: 'id'
      }, function (err, file) {
        if (err) {
          // Handle error
          console.error(err);
        } else {
          // store folder id
          database.ref('/groups/' + group).set({
            id: file.data.id
          });
          //store encrypted symmetric key
          database.ref('/groups/' + group + '/users/' + user).set({
            symmetrickey: symmEnc
          });
          // specify group owner
          database.ref('/groups/' + group + '/owner').set({
            owner: user
          });
          // save group for the user
          database.ref('/users/' + user + '/groups/' + group).set({
            name: group,
            owner: 1
          });
        }
      });

    }
    //return if the group has been created.
    request.post(
        'http://localhost:8080/newgroup',
        { json: { b: b } },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log(body);
            }
        }
    );

  });

});


/*
Returns the names of every file in a group
*/
app.post('/files', function(req, res) {

  var group = req.body.groupname;
  var dest = req.body.dest; // some client destination to return to

  //first list all folders
  drive.files.list({
    auth: jwtClient,
    includeRemoved: false,
    spaces: 'drive',
    fileId: homeFolder,
    fields: 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)',
    q: `'${homeFolder}' in parents`
  }, (listErr, resp) => {
      if (listErr) {
        console.log(listErr);
        return;
      }
      resp.data.files.forEach((file) => {
        var b = group.localeCompare(file.name);
        if(b==0){ // if correct folder is found
          var folderId = file.id;
          //list all files in folder
          drive.files.list({
            auth: jwtClient,
            includeRemoved: false,
            spaces: 'drive',
            fileId: [folderId],
            fields: 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)',
            q: `'${[folderId]}' in parents`
          }, (listErr, resp) => {
              if (listErr) {
                console.log(listErr);
                return;
              }
              var filenames = []; // empty array of filenames
              // push each filename in folder to filenames array
              resp.data.files.forEach((file) => {
                filenames.push(file.name);
              });

              // send filenames in JSON format to specified destination
              request.post(
                  'http://localhost:8080/' + dest,
                  { json: { filenames: JSON.stringify(filenames) } },
                  function (error, response, body) {
                      if (!error && response.statusCode == 200) {
                          console.log(body);
                      }
                  }
              );

          });
        }
      });
  });
});


/*
Takes a filename, username and group and downloads the specified file
from that group, saving it locally. When this file is downloaded and stored
it's contents are of course still encrypted. The user's encrypted symmetric key
for the group is sent back to client so that it can be decrypted and then used
to decrypt the file contents.
*/
app.post('/downloaded', function(req, res) {
  var filename = req.body.file;
  var user = req.body.user;
  var group = req.body.groupname;

  groupRef.once('value', function(snapshot1) {
    var id = "";
    snapshot1.forEach(function(folder){
      var b = group.localeCompare(folder.key);
      if(b==0){
        /*
          first retrieve folder id from database and then list
          the files in that folder.
        */
        id = folder.val().id;
        drive.files.list({
          auth: jwtClient,
          includeRemoved: false,
          spaces: 'drive',
          fileId: [id],
          fields: 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)',
          q: `'${[id]}' in parents`
        }, (listErr, resp) => {
            if (listErr) {
              console.log(listErr);
              return;
            }
            resp.data.files.forEach((file) => {
              var u = filename.localeCompare(file.name);
              if(u==0){
                  //if the file is found then download it, saving it to the
                  //local directory 'downloaded files'
                  var id = file.id;
                  var dlfile = fs.createWriteStream('./downloadedfiles/' + file.name);
                  var f = drive.files.get({
                      auth: jwtClient,
                      fileId: id,
                      alt: 'media'
                    },
                    {responseType: 'stream'},
                    function(err, res){
                      res.data
                      .on('end', () => {
                      })
                      .on('error', err => {
                          console.log('Error', err);
                      })
                      .pipe(dlfile);
                      /*
                      Once the file is downloaded, the user's version of the
                      symmetric key is retrieved and sent back to the client
                      along with the filename and contents
                      */
                      sendFile(file.name, user, group);
                    }
                  );
              }
            });
        });
      }
    });
  });

});


/*
Used for adding anew member to a group. The inviting member's version of
the symmetric key and the new member's public key are retrieved from the
database and returned to the client. The client will then decrypt the symmetric
key using the new member's private key (which the server does not have access
to) and then re-encrypt it with their public key.
*/
app.post('/symmpub', function(req, res) {

  var u1 = req.body.user1; // the inviting member
  var u2 = req.body.user2; // the group's new member
  var group = req.body.group;

  userRef.once('value', function(snapshot) {
    if(snapshot.hasChild(u2)){
      var pk = snapshot.child(u2).val().publickey;
      groupRef.once('value', function(snapshot1) {
        if(snapshot1.hasChild(group)){
          var users = snapshot1.child(group).child("users");
          if(users.hasChild(u1)){
            var symm = users.child(u1).val().symmetrickey;
            request.post(
                'http://localhost:8080/newmember',
                { json: { publickey: pk,
                          symmkey: symm,
                          group: group } },
                function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        console.log(body);
                    }
                }
            );

          }
        }
      })
    }
  });

});


/*
After the client has encrypted the group's symmetric key with the new
group member's public key it sends a request to the server (handled here)
to add the new member to the group in the database.
*/
app.post('/newmember', function(req, res) {

  var user = req.body.user; // new member
  var symmkey = req.body.symmkey; // new member's version of group's symm key
  var group = req.body.group;

  database.ref('/groups/' + group + '/users/' + user).set({
    symmetrickey: symmkey
  });

  // specify that the new member is not the owner of this group
  database.ref('/users/' + user + '/groups/' + group).set({
    name: group,
    owner: 0
  });
});


/*
Returns to the client all the groups that a specified user is a member of.
*/
app.post('/sendgroups', function(req, res) {
  var usr = req.body.user;
  var dest = req.body.dest; // url to return to in client
  userRef.once('value', function(snapshot) {
    var g = []; // empty array of groupnames
    if(snapshot.hasChild(usr)){
      var u = snapshot.child(usr);
      if(u.hasChild('groups')){
        var groups = u.child('groups');
        groups.forEach(function(group) {
          g.push(group.val().name); // add each groupname to the array
        })
      }
    }
    request.post(
        'http://localhost:8080/' + dest,
        { json: { groups: JSON.stringify(g) } },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log(body);
            }
        }
    );
  });

});


/*
Returns to the client the list of groups owned by a specified user.
*/
app.post('/sendownedgroups', function(req, res) {
  var usr = req.body.user;
  var dest = req.body.dest;
  userRef.once('value', function(snapshot) {
    var g = [];
    if(snapshot.hasChild(usr)){
      var u = snapshot.child(usr);
      if(u.hasChild('groups')){
        var groups = u.child('groups');
        groups.forEach(function(group) {
          var o = group.val().owner;
          // if the user owns this group add it to the array of group names
          if(o==1){
            g.push(group.val().name);
          }
        })
      }
    }
    request.post(
        'http://localhost:8080/' + dest,
        { json: { groups: JSON.stringify(g) } },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log(body);
            }
        }
    );
  });

});


/*
Removes a user from a group
*/
app.post('/remove', function(req, res) {

  var owner = req.body.user1;
  var rem = req.body.user2;
  var group = req.body.group;

  // remove reference to the group from the user
  userRef.once('value', function(snapshot) {
    if(snapshot.hasChild(rem)){
      var u = snapshot.child(rem);
      if(u.hasChild('groups')){
        if(u.child('groups').hasChild(group)){
          database.ref('/users/' + rem + '/groups/' + group).remove();
        }
      }
    }
  });

  // remove reference to the user from the group
  groupRef.once('value', function(snapshot1) {
    if(snapshot1.hasChild(group)){
      var g = snapshot1.child(group);
      if(g.hasChild('users')){
        if(g.child('users').hasChild(rem)){
          database.ref('/groups/' + group + '/users/' + rem).remove();
        }
      }
    }
  });

});


/*
Deletes file from group by calling function deleteFile
*/
app.post('/deletefile', function(req, res) {

  var file = req.body.file;
  var group = req.body.groupname;
  deleteFile(file, group);

});


/*
deletes group from database and corresponding folder on the drive
*/
app.post('/deletegroup', function(req, res) {

  var group = req.body.group;

  groupRef.once('value', function(snapshot1){
    var id = "";
    snapshot1.forEach(function(folder){
      var b = group.localeCompare(folder.key);
      if(b==0){
        // if folder is found delete using the folder id
        drive.files.delete({
          auth: jwtClient,
          'fileId': [folder.val().id]
        });
        // delete all references to the group from database
        database.ref('/groups/' + group).remove();
        userRef.once('value', function(snapshot) {
          snapshot.forEach(function(user){
            if(user.hasChild('groups')){
              if(user.child('groups').hasChild(group)){
                database.ref('/users/' + user.key + '/groups/' + group).remove();
              }
            }
          });
        });
      }
    });
  });
});


/*
Function that handles uploading a file to the drive. Using the filename
and the contents of the file it creates a plain text file of that name with
those contents in the given folder on the drive.
*/
function uploadFile(name, contents, folder){

  // first list all folders
  drive.files.list({
    auth: jwtClient,
    includeRemoved: false,
    spaces: 'drive',
    fileId: homeFolder,
    fields: 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)',
    q: `'${homeFolder}' in parents`
  }, (listErr, resp) => {
      if (listErr) {
        console.log(listErr);
        return;
      }
      //search through all folders
      resp.data.files.forEach((file) => {
        var u = folder.localeCompare(file.name);
        // if correct folder is found
        if(u==0){
          const fileMetadata = {
            name: name,
            parents: [file.id]
          };
           const media = {
            mimeType: 'text/plain',
            body: contents
           };
           drive.files.create({
            auth: jwtClient,
            resource: fileMetadata,
            media,
            fields: 'id'
          }, (err, file) => {
            if (err) {
              console.log(err);
              return;
            }
              console.log('Uploaded File Id: ', file.data.id);
           });

        }
      });
  });
}


/*
Function to delete a file from certain group/folder on the drive.
*/
function deleteFile(name, group){

  groupRef.once('value', function(snapshot){
    var id = "";
    snapshot.forEach(function(folder){
      var b = group.localeCompare(folder.key);
      // if correct group is found using the folder id
      if(b==0){
        id = folder.val().id;
        // list all files in the group
        drive.files.list({
          auth: jwtClient,
          includeRemoved: false,
          spaces: 'drive',
          fileId: [id],
          fields: 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)',
          q: `'${[id]}' in parents`
        }, (listErr, resp) => {
            if (listErr) {
              console.log(listErr);
              return;
            }
            resp.data.files.forEach((file) => {
              var u = name.localeCompare(file.name);
              // find the right file and delete it
              if(u==0){
                drive.files.delete({
                  auth: jwtClient,
                  'fileId': [file.id]
                });
              }
            });
        });
      }
    });
  })
}

/*
function to send encrypted file contents back to client to
be decrypted and written to the 'downloaded files' directory
*/
function sendFile(name, user, group){
  groupRef.once('value', function(snapshot) {
    if(snapshot.hasChild(group)){
      var users = snapshot.child(group).child("users");
      if(users.hasChild(user)){
        var symm = users.child(user).val().symmetrickey;
        fs.readFile('./downloadedfiles/' + name, 'utf8', function(err, data){
          if(err){
            console.log(err);
          }
          request.post(
              'http://localhost:8080/decrypt',
              { json: { filename: name,
                        contents: data,
                        symmkey: symm } },
              function (error, response, body) {
                  if (!error && response.statusCode == 200) {
                      console.log(body);
                  }
              }
          );

        });
      }
    }
  })
}

app.listen(8081, function () {
    console.log('Listening on http://localhost:8081');
});
