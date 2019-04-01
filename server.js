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
const destroyer = require('server-destroy');
const config = require('./auth.json');
var request = require('request');

var serviceAccount = require("./cloud-storage-app-3a043-firebase-adminsdk-j1g4l-8a92764e80.json");

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: "https://cloud-storage-app-3a043.firebaseio.com"
});

var database = firebase.database()

const drive = google.drive('v3');
const homeFolder = ["1pMAGP9xJRtEDFAImABbw9RwPoVoPQyVl"]

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

const userRef = database.ref('/users/');
const groupRef = database.ref('/groups/');

app.post('/newuser', function(req, res) {

  var publicKey = req.body.publicKey;
  var user = req.body.username;
  var pass = req.body.password;

  database.ref('/users/' + user).set({
    publickey: publicKey,
    username: user,
    password: pass
  });
});

app.post('/olduser', function(req, res) {

  var user = req.body.username;
  var pass = req.body.password;

  userRef.once('value', function(snapshot) {
    if(snapshot.hasChild(user)){
      var usrn = snapshot.child(user).val().username;
      var pswd = snapshot.child(user).val().password;
      var u = usrn.localeCompare(user);
      var p = pswd.localeCompare(pass);
      if (u != 0 || p != 0){
        request.post(
            'http://localhost:8080/login',
            { json: { b: 0 } },
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(body);
                }
            }
        );
      }
      else{
        request.post(
            'http://localhost:8080/login',
            { json: { b: 1 } },
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(body);
                }
            }
        );

      }
    }
    else{
      request.post(
          'http://localhost:8080/login',
          { json: { b: 0 } },
          function (error, response, body) {
              if (!error && response.statusCode == 200) {
                  console.log(body);
              }
          }
      );
    }
  });


});


app.post('/sendsymmkey', function(req, res) {

  var user = req.body.user;
  var groupchoice = req.body.group;
  var dest = req.body.destination;

  groupRef.once('value', function(snapshot) {
    if(snapshot.hasChild(groupchoice)){
      var users = snapshot.child(groupchoice).child("users");
      if(users.hasChild(user)){
        var symm = users.child(user).val().symmetrickey;
        request.post(
            'http://localhost:8080/newupload',
            { json: { symmkey: symm } },
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


app.post('/upload', function(req, res) {
    var filename = req.body.file;
    var enc = req.body.enc;
    var groupchoice = req.body.group;
    uploadFile(filename, enc, groupchoice);
});


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

          database.ref('/groups/' + group).set({
            id: file.data.id
          });

          database.ref('/groups/' + group + '/users/' + user).set({
            symmetrickey: symmEnc
          });

          database.ref('/groups/' + group + '/owner').set({
            owner: user
          });

          database.ref('/users/' + user + '/groups/' + group).set({
            name: group,
            owner: 1
          });
        }
      });

    }
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


app.post('/files', function(req, res) {

  var groupchoice2 = req.body.groupname;
  var dest = req.body.dest;

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
        var b = groupchoice2.localeCompare(file.name);
        if(b==0){
          var folderId = file.id;
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
              var filenames = [];
              resp.data.files.forEach((file) => {
                filenames.push(file.name);
              });

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


app.post('/downloaded', function(req, res) {
  var filename = req.body.file;
  var user = req.body.user;
  var group = req.body.groupname;

  groupRef.once('value', function(snapshot1) {
    var id = "";
    snapshot1.forEach(function(folder){
      var b = group.localeCompare(folder.key);
      if(b==0){
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

                      groupRef.once('value', function(snapshot) {
                        if(snapshot.hasChild(group)){
                          var users = snapshot.child(group).child("users");
                          if(users.hasChild(user)){
                            var symm = users.child(user).val().symmetrickey;
                            request.post(
                                'http://localhost:8080/decrypt',
                                { json: { filename: file.name,
                                          symmkey: symm } },
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
                  );
              }
            });
        });
      }
    });
  });

});


app.post('/symmpub', function(req, res) {

  var u1 = req.body.user1;
  var u2 = req.body.user2;
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


app.post('/newmember', function(req, res) {

  var user = req.body.user;
  var symmkey = req.body.symmkey;
  var group = req.body.group;

  database.ref('/groups/' + group + '/users/' + user).set({
    symmetrickey: symmkey
  });

  database.ref('/users/' + user + '/groups/' + group).set({
    name: group,
    owner: 0
  });


});


app.post('/sendgroups', function(req, res) {
  var usr = req.body.user;
  var dest = req.body.dest;
  userRef.once('value', function(snapshot) {
    var g = [];
    if(snapshot.hasChild(usr)){
      var u = snapshot.child(usr);
      if(u.hasChild('groups')){
        var groups = u.child('groups');
        groups.forEach(function(group) {
          g.push(group.val().name);
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


app.post('/remove', function(req, res) {

  var owner = req.body.user1;
  var rem = req.body.user2;
  var group = req.body.group;

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


app.post('/deletefile', function(req, res) {

  var file = req.body.file;
  var group = req.body.groupname;
  deleteFile(file, group);

});


app.post('/deletegroup', function(req, res) {

  var group = req.body.group;

  groupRef.once('value', function(snapshot1){
    var id = "";
    snapshot1.forEach(function(folder){
      var b = group.localeCompare(folder.key);
      if(b==0){
        drive.files.delete({
          auth: jwtClient,
          'fileId': [folder.val().id]
        });
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


function uploadFile(name, contents, folder){

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
        var u = folder.localeCompare(file.name);
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


function deleteFile(name, group){

  groupRef.once('value', function(snapshot){
    var id = "";
    snapshot.forEach(function(folder){
      var b = group.localeCompare(folder.key);
      if(b==0){
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
              var u = name.localeCompare(file.name);
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


function decryptFile(name, sym){

  fs.readFile('./downloadedfiles/' + name, 'utf8', function(err, data){
    if(err){
      console.log(err);
    }

    var dec = cryptojs.AES.decrypt(data, sym);
    fs.writeFile('./downloadedfiles/' + name, dec.toString(cryptojs.enc.Utf8), 'utf8', function(err){
      if(err){
        console.log("shite");
      }
    });
  });
}


app.listen(8081, function () {
    console.log('Listening on http://localhost:8081');
});
