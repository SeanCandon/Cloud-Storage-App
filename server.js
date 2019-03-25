var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.urlencoded({extended: false}));
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

//});

var signedin = 0;

var user = "";
var pass = "";

var groupchoice = "";
var groupchoice2 = "";

const userRef = database.ref('/users/');
const groupRef = database.ref('/groups/');

app.get('/', function (req, res) {
    fs.readFile('./pages/home.html', function(err, data){
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data);
      return res.end();
    })
});

app.post('/newuser', function(req, res) {

    user = req.body.newusername;
    pass = req.body.newpassword;

    userRef.once('value', function(snapshot) {
      if(snapshot.hasChild(user)){
        fs.readFile('./pages/home.html', function(err, data){
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.write(data);
          return res.end();
        })
      }
      else{

        var privateKey, publicKey;
        publicKey = '';
        cp.exec('openssl genrsa 2048', function(err, stdout, stderr) {
          assert.ok(!err);
          privateKey = stdout;
          fs.readFile('privateKeys.json', 'utf8', function readFileCallback(err, data){
            if (err){
                console.log(err);
            } else {
              obj = JSON.parse(data); //now it an object
              obj.keys.push({username: user, key: privateKey}); //add some data
              json = JSON.stringify(obj); //convert it back to json
              fs.writeFile('privateKeys.json', json, 'utf8', null); // write it back
            }
          });
          makepub = cp.spawn('openssl', ['rsa', '-pubout']);
          makepub.on('exit', function(code) {
            assert.equal(code, 0);
            database.ref('/users/' + user).set({
              publickey: publicKey,
              username: user,
              password: pass
            });
          });
          makepub.stdout.on('data', function(data) {
            publicKey += data;
          });
          makepub.stdout.setEncoding('ascii');
          makepub.stdin.write(privateKey);
          makepub.stdin.end();
        });

      fs.readFile('./pages/newuser.html', function(err, data){
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(data);
        return res.end();
      })
    }
  });
});

app.post('/olduser', function(req, res) {

  user = req.body.username;
  pass = req.body.password;

  userRef.once('value', function(snapshot) {
    if(snapshot.hasChild(user)){
      var usrn = snapshot.child(user).val().username;
      var pswd = snapshot.child(user).val().password;
      var u = usrn.localeCompare(user);
      var p = pswd.localeCompare(pass);
      if (u != 0 || p != 0){
        fs.readFile('./pages/home.html', function(err, data){
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.write(data);
          return res.end();
        })
      }
      else{
        fs.readFile('./pages/console.html', function(err, data){
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.write(data);
          return res.end();
        })
      }
    }
    else{
      fs.readFile('./pages/home.html', function(err, data){
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(data);
        return res.end();
      })
    }
  });


});


app.post('/console', function(req, res){

  fs.readFile('./pages/console.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});


app.post('/uploaded', function(req, res){
  //console.log(groupchoice);
  fs.readFile('./pages/console.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })

  new formidable.IncomingForm().parse(req, (err, fields, files) => {
    if (err) {
      console.error('Error', err)
      throw err
    }
    var oldpath = files.filetoupload.path;
    var newpath = './uploadedfiles/' + files.filetoupload.name;
    fs.rename(oldpath, newpath, function (err) {
      if (err) throw err;
    });

    groupRef.once('value', function(snapshot) {
      if(snapshot.hasChild(groupchoice)){
        console.log("user = " + user);
        var symmkey = snapshot.child(groupchoice).child("users").child(user).val().symmetrickey;

        fs.readFile('privateKeys.json', 'utf8', function readFileCallback(err, data){
          var mykey = "";
          if (err){
              console.log(err);
          } else {
            obj = JSON.parse(data); //now it an object
            var keys = obj["keys"];
            keys.forEach(function(key) {
              var b = user.localeCompare(key.username);
              if(b==0){
                var pk = key.key;
                mykey = decrypt(symmkey, pk);
              }
            });
          }
          if(mykey != ""){
            fs.readFile(newpath, 'utf-8', function(err, contents) {
              if(err){
                console.log(err);
              }
              else{
                var encryptedboi = cryptojs.AES.encrypt(contents, mykey);
                var decryptedboi = cryptojs.AES.decrypt(encryptedboi.toString(), mykey);
                console.log("decryptedboi = " + decryptedboi.toString(cryptojs.enc.Utf8));
                uploadFile(files.filetoupload.name, encryptedboi.toString(), groupchoice);
              }
            })
          }
        });
      }
    });
  })
});

app.post('/choose', function(req, res) {
  fs.readFile('./pages/choosegroup.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});


app.post('/upload', function(req, res) {

  groupchoice = req.body.groupname;

  fs.readFile('./pages/upload.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});

app.post('/create', function(req, res) {
  fs.readFile('./pages/create.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});

app.post('/created', function(req, res) {
  var group = req.body.groupname;
  console.log(group);

  createFolder(group);

  groupRef.once('value', function(snapshot) {
    if(snapshot.hasChild(group)){
      fs.readFile('./pages/unsuccessful.html', function(err, data){
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(data);
        return res.end();
      })
    }
    else{
      var symmkey = generateKey();
      console.log("symm key = " + symmkey);

      userRef.once('value', function(snapshot1) {
        if(snapshot1.hasChild(user)){
          var pubkey = snapshot1.child(user).val().publickey;
          var symmEnc = encrypt(symmkey, pubkey);

          database.ref('/groups/' + group + '/users/' + user).set({
            symmetrickey: symmEnc
          });
          fs.readFile('./pages/console.html', function(err, data){
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.write(data);
            return res.end();
          })
        }
      });
    }
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

              fs.readFile('./pages/files.html', function(err, data){
                res.writeHead(200, {'Content-Type': 'text/html'});
                var json = JSON.stringify(filenames);
                var result = data.toString('utf-8').replace('{{data}}', json);
                res.write(result);
                return res.end();
              })
          });
        }
      });
  });
});


app.post('/downloaded', function(req, res) {
  var filename = req.body.file;
  console.log(filename);

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
              console.log(file.name);
              var u = filename.localeCompare(file.name);
              if(u==0){
                  //console.log("wow");
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
                      fs.readFile('privateKeys.json', 'utf8', function(err, data){
                        if(err){
                          console.log(err);
                        }
                        obj = JSON.parse(data);
                        keys = obj["keys"];
                        keys.forEach(function(key){
                          var u = user.localeCompare(key.username);
                          if(u==0){
                            var pk = key.key;
                            groupRef.once('value', function(snapshot) {
                              if(snapshot.hasChild(groupchoice2)){
                                var users = snapshot.child(groupchoice2).child("users");
                                if(users.hasChild(user)){
                                  var symm = users.child(user).val().symmetrickey;
                                  var dec =  decrypt(symm, pk);
                                  decryptFile(file.name, dec);
                                }
                              }
                            })

                          }
                        });
                      });
                    }
                  );
                //var symm = getSymmetricKey(user, groupchoice2);
                //decryptFile(file.name, symm);
              }
            });
        });
      }
    });
  })

  fs.readFile('./pages/console.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});

app.post('/invite', function(req, res) {

  fs.readFile('./pages/invite.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});

app.post('/invited', function(req, res) {

  var me = req.body.user1;
  var newuser = req.body.user2;
  var group = req.body.group;

  userRef.once('value', function(snapshot) {
    if(snapshot.hasChild(newuser)){
      var pk = snapshot.child(newuser).val().publickey;
      groupRef.once('value', function(snapshot1) {
        if(snapshot1.hasChild(group)){
          var users = snapshot1.child(group).child("users");
          if(users.hasChild(me)){
            var symm = users.child(me).val().symmetrickey;
            fs.readFile('privateKeys.json', 'utf8', function readFileCallback(err, data){
              var mykey = "";
              if (err){
                  console.log(err);
              } else {
                obj = JSON.parse(data); //now it an object
                var keys = obj["keys"];
                keys.forEach(function(key) {
                  var b = me.localeCompare(key.username);
                  if(b==0){
                    mykey = key.key;
                    var dec = decrypt(symm, mykey);
                    var newsymm = encrypt(dec, pk);
                    database.ref('/groups/' + group + '/users/' + newuser).set({
                      symmetrickey: newsymm
                    });

                  }
                });
              }

            });
          }
        }
      })
    }
  });


  fs.readFile('./pages/console.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});


app.post('/choose2', function(req, res) {

  fs.readFile('./pages/choosegroup2.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});


function generateKey() {
  var keyLength = 50;
  var chars =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz*&-%/!?*+=()";
  var randomString = '';
  for (var i=0; i < keyLength; i++) {
    var rnum = Math.floor(Math.random() * chars.length);
    randomString += chars.substring(rnum,rnum+1);
  }
  return randomString;
}


var encrypt = function(toEncrypt, publicKey) {
    var buffer = Buffer.from(toEncrypt);
    var encrypted = crypto.publicEncrypt(publicKey, buffer);
    return encrypted.toString("base64");
};

var decrypt = function(toDecrypt, privateKey) {
    var buffer = Buffer.from(toDecrypt, "base64");
    var decrypted = crypto.privateDecrypt(privateKey, buffer);
    return decrypted.toString("utf8");
};


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


app.listen(8080, function () {
    console.log('Listening on http://localhost:8080');
});
