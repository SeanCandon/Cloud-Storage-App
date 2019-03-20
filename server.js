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

var serviceAccount = require("./cloud-storage-app-3a043-firebase-adminsdk-j1g4l-8a92764e80.json");

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: "https://cloud-storage-app-3a043.firebaseio.com"
});

var database = firebase.database()

var signedin = 0;

var user = "";
var pass = "";

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

        var string = crypto.randomBytes(40).toString('base64');
        var bits = 1024;
        var privKey = cryptico.generateRSAKey(string, bits);
        var privateKey = JSON.stringify(privKey);
        var publicKey = cryptico.publicKeyString(privKey)
        //console.log(rsa);

        database.ref('/users/' + user).set({
          publickey: publicKey,
          username: user,
          password: pass
        });

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
    var newpath = './' + files.filetoupload.name;
    fs.rename(oldpath, newpath, function (err) {
      if (err) throw err;
    });
  })
});


app.post('/upload', function(req, res) {
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

      userRef.once('value', function(snapshot1) {
        if(snapshot1.hasChild(user)){
          var pubkey = snapshot1.child(user).val().publickey;
          var symmEnc = cryptico.encrypt(symmkey, pubkey);
          database.ref('/groups/' + group + '/users' + user).set({
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


app.listen(8080, function () {
    console.log('Listening on http://localhost:8080');
});
