var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser());
var fs = require('fs');
var url = require('url');
var firebase = require('firebase-admin')
var formidable = require('formidable');

var serviceAccount = require("./cloud-storage-app-3a043-firebase-adminsdk-j1g4l-8a92764e80.json");

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: "https://cloud-storage-app-3a043.firebaseio.com"
});

var database = firebase.database()

var signedin = 0;

const userRef = database.ref('/users/');

app.get('/', function (req, res) {
    fs.readFile('home.html', function(err, data){
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data);
      return res.end();
    })
});

app.post('/newuser', function(req, res) {

    var user = req.body.newusername;
    var pass = req.body.newpassword;

    userRef.once('value', function(snapshot) {
      if(snapshot.hasChild(user)){
        fs.readFile('home.html', function(err, data){
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.write(data);
          return res.end();
        })
      }
      else{
        database.ref('/users/' + user).set({
          username: user,
          password: pass
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

  var user = req.body.username;
  var pass = req.body.password;

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
  fs.readFile('file_uploaded.html', function(err, data){
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



app.listen(8080, function () {
    console.log('Listening on http://localhost:8080');
});
