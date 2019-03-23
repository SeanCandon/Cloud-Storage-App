var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.urlencoded({extended: false}));
var fs = require('fs');
var url = require('url');
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

  /*
  drive.files.list({
    auth: jwtClient,
    includeRemoved: false,
    spaces: 'drive',
    fileId: "1pMAGP9xJRtEDFAImABbw9RwPoVoPQyVl",
    fields: 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)',
    q: `'${"1pMAGP9xJRtEDFAImABbw9RwPoVoPQyVl"}' in parents`
  }, (listErr, resp) => {
      if (listErr) {
        console.log(listErr);
        return;
      }
      resp.data.files.forEach((file) => {
        console.log(`${file.name} (${file.mimeType})`);
      });
  });*/
//});

var signedin = 0;

var user = "";
var pass = "";

var groupchoice = "";

const userRef = database.ref('/users/');
const groupRef = database.ref('/groups/');

app.get('/', function (req, res) {
    fs.readFile('home.html', function(err, data){
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
        fs.readFile('home.html', function(err, data){
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

      fs.readFile('newuser.html', function(err, data){
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
        fs.readFile('home.html', function(err, data){
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.write(data);
          return res.end();
        })
      }
      else{
        fs.readFile('console.html', function(err, data){
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.write(data);
          return res.end();
        })
      }
    }
    else{
      fs.readFile('home.html', function(err, data){
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(data);
        return res.end();
      })
    }
  });


});


app.post('/console', function(req, res){

  fs.readFile('console.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});


app.post('/uploaded', function(req, res){
  //console.log(groupchoice);
  fs.readFile('console.html', function(err, data){
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
                uploadFile(files.filetoupload.name, encryptedboi.toString());
              }

            })
          }
        });
      }
    });

    //uploadFile(files.filetoupload.name, newpath);

  })


  /*
  fs.readFile(newpath, 'utf-8', function(err, contents) {

  })*/

});

app.post('/choose', function(req, res) {
  fs.readFile('choosegroup.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});


app.post('/upload', function(req, res) {

  groupchoice = req.body.groupname;

  fs.readFile('upload.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});

app.post('/create', function(req, res) {
  fs.readFile('create.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});

app.post('/created', function(req, res) {
  var group = req.body.groupname;
  console.log(group);

  groupRef.once('value', function(snapshot) {
    if(snapshot.hasChild(group)){
      fs.readFile('unsuccessful.html', function(err, data){
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
          fs.readFile('console.html', function(err, data){
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.write(data);
            return res.end();
          })
        }
      });
    }
  });

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


function uploadFile(name, contents){

  const fileMetadata = {
    name: name,
    parents: homeFolder
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


app.listen(8080, function () {
    console.log('Listening on http://localhost:8080');
});
