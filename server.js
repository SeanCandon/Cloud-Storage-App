var express = require('express');
var bodyParser = require('body-parser');
var app = express();
//app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser());
var fs = require('fs');
var url = require('url');
var html = require('html');
var firebase = require('firebase-admin')
var formidable = require('formidable');
var cp = require('child_process');
var assert = require('assert');
var crypto = require('crypto');
var cryptico = require('cryptico');
var cryptojs = require('crypto-js');
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

var user = "";
var pass = "";

var groupchoice2 = "";

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
    console.log(filename);
    console.log(groupchoice);
    uploadFile(filename, enc, groupchoice);
});


app.post('/sendpubkey', function(req, res) {

  user = req.body.user;

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
  console.log(group);

  createFolder(group);

  var b = 0;

  groupRef.once('value', function(snapshot) {
    if(snapshot.hasChild(group)){
      b = 0;
    }
    else{
      b = 1;
      console.log("wowowowoow");
      database.ref('/groups/' + group + '/users/' + user).set({
        symmetrickey: symmEnc
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

  groupchoice2 = req.body.groupname;

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
          console.log("Folder = " + file.name);
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
                  'http://localhost:8080/displayfiles',
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

  fs.readFile('folderIDs.json', 'utf8', function(err, data){
    var id = "";
    obj = JSON.parse(data);
    folders = obj["folders"];
    folders.forEach(function(folder){
      var b = groupchoice2.localeCompare(folder.name);
      if(b==0){
        id = folder.id;
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
                        if(snapshot.hasChild(groupchoice2)){
                          var users = snapshot.child(groupchoice2).child("users");
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
  })

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

function createFolder(name){

  var fileMetadata = {
  name: name,
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
      console.log('Folder Id: ', file.data.id);
      fs.readFile('folderIDs.json', 'utf8', function readFileCallback(err, data){
        if (err){
            console.log(err);
        } else {
          obj = JSON.parse(data); //now it an object
          obj.folders.push({name: name, id: file.data.id}); //add some data
          json = JSON.stringify(obj); //convert it back to json
          fs.writeFile('folderIDs.json', json, 'utf8', null); // write it back
        }
      });
    }
  });

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
