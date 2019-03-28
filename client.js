var express = require('express');
var bodyParser = require('body-parser');
var app = express();
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


var signedin = 0;

var user = "";
var pass = "";

var groupchoice = "";
var groupchoice2 = "";
var createdGroup = "";
var fileupload = "";
var newuser = "";

var browser;

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

    //TODO check if user already exists

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
        console.log(user);
        request.post(
            'http://localhost:8081/newuser',
            { json: { publicKey: publicKey,
                      username: user,
                      password: pass } },
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(body);
                }
            }
        );
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
});

app.post('/olduser', function(req, res) {

  user = req.body.username;
  pass = req.body.password;

  browser = res;

  request.post(
      'http://localhost:8081/olduser',
      { json: { username: user,
                password: pass } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );

});

app.post('/login', function(req, res) {

  var b = req.body.b;
  if(b==0){
    fs.readFile('./pages/home.html', function(err, data){
      browser.writeHead(200, {'Content-Type': 'text/html'});
      browser.write(data);
      return browser.end();
    })
  }
  else{
    fs.readFile('./pages/console.html', function(err, data){
      browser.writeHead(200, {'Content-Type': 'text/html'});
      browser.write(data);
      return browser.end();
    })
  }

})


app.post('/console', function(req, res){

  fs.readFile('./pages/console.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
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



app.post('/uploaded', function(req, res){

  browser = res;

  new formidable.IncomingForm().parse(req, (err, fields, files) => {
    if (err) {
      console.error('Error', err)
      throw err
    }
    var oldpath = files.filetoupload.path;
    var newpath = './uploadedfiles/' + files.filetoupload.name;
    fileupload = files.filetoupload.name;
    fs.rename(oldpath, newpath, function (err) {
      if (err) throw err;
    });

    request.post(
        'http://localhost:8081/sendsymmkey',
        { json: { user: user,
                  group: groupchoice } },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log(body);
            }
        }
    );

  })
});


app.post('/newupload', function(req, res) {

  var symmkey = req.body.symmkey;

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
      fs.readFile('./uploadedfiles/' + fileupload, 'utf-8', function(err, contents) {
        if(err){
          console.log(err);
        }
        else{
          var encryptedboi = cryptojs.AES.encrypt(contents, mykey);
          //var decryptedboi = cryptojs.AES.decrypt(encryptedboi.toString(), mykey);
          //console.log("decryptedboi = " + decryptedboi.toString(cryptojs.enc.Utf8));
          request.post(
              'http://localhost:8081/upload',
              { json: { file: fileupload,
                        enc: encryptedboi.toString(),
                        group: groupchoice } },
              function (error, response, body) {
                  if (!error && response.statusCode == 200) {
                      console.log(body);
                  }
              }
          );
        }
      })
    }
  });
  fs.readFile('./pages/console.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    browser.write(data);
    return browser.end();
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
  createdGroup = req.body.groupname;
  browser = res;

  request.post(
      'http://localhost:8081/sendpubkey',
      { json: { user: user } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );

});

app.post('/getpubkey', function(req, res) {

  var pubkey = req.body.pubkey;
  //console.log("pubkey = " + pubkey)

  var symmkey = generateKey();
  var symmEnc = encrypt(symmkey, pubkey);

  request.post(
      'http://localhost:8081/created',
      { json: { groupname: createdGroup,
                symmenc: symmEnc } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );


});

app.post('/newgroup', function(req, res) {

  var b = req.body.b;

  if(b==0){
    fs.readFile('./pages/unsuccessful.html', function(err, data){
      browser.writeHead(200, {'Content-Type': 'text/html'});
      browser.write(data);
      return browser.end();
    })
  }
  else{
    fs.readFile('./pages/console.html', function(err, data){
      browser.writeHead(200, {'Content-Type': 'text/html'});
      browser.write(data);
      return browser.end();
    })

  }
})


app.post('/files', function(req, res) {

  browser = res;

  groupchoice2 = req.body.groupname;

  request.post(
      'http://localhost:8081/files',
      { json: { groupname: groupchoice2 } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );

});

app.post("/displayfiles", function(req, res) {

  var filenames = req.body.filenames;

  fs.readFile('./pages/files.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    //var json = JSON.stringify(filenames);
    var result = data.toString('utf-8').replace('{{data}}', filenames);
    browser.write(result);
    return browser.end();
  })
});


app.post('/downloaded', function(req, res) {
  var filename = req.body.file;
  browser = res;

  request.post(
      'http://localhost:8081/downloaded',
      { json: { file: filename } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );
});

app.post('/decrypt', function(req, res) {

  var name = req.body.filename;
  var symm = req.body.symmkey;

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
        var dec =  decrypt(symm, pk);
        decryptFile(name, dec);
      }
    });
  });

  fs.readFile('./pages/console.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    browser.write(data);
    return browser.end();
  })
})



app.post('/invite', function(req, res) {

  fs.readFile('./pages/invite.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});

app.post('/invited', function(req, res) {

  browser = res;

  var me = req.body.user1;
  newuser = req.body.user2;
  var group = req.body.group;

  request.post(
      'http://localhost:8081/symmpub',
      { json: { user1: me,
                user2: newuser,
                group: group } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );
});


app.post('/newmember', function(req, res) {

  var publickey = req.body.publickey;
  var symmkey = req.body.symmkey;
  var group = req.body.group;
  fs.readFile('privateKeys.json', 'utf8', function readFileCallback(err, data){
    var mykey = "";
    if (err){
        console.log(err);
    } else {
      obj = JSON.parse(data);
      var keys = obj["keys"];
      keys.forEach(function(key) {
        var b = user.localeCompare(key.username);
        if(b==0){
          mykey = key.key;
          var dec = decrypt(symmkey, mykey);
          var newsymm = encrypt(dec, publickey);
          request.post(
              'http://localhost:8081/newmember',
              { json: { user: newuser,
                        symmkey: newsymm,
                        group: group } },
              function (error, response, body) {
                  if (!error && response.statusCode == 200) {
                      console.log(body);
                  }
              }
          );
        }
      });
    }

  });
  fs.readFile('./pages/console.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    browser.write(data);
    return browser.end();
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