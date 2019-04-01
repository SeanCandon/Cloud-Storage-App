var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser());
var fs = require('fs');
var url = require('url');
var html = require('html');
var formidable = require('formidable');
var cp = require('child_process');
var assert = require('assert');
var crypto = require('crypto');
var cryptico = require('cryptico');
var cryptojs = require('crypto-js');
const path = require('path');
const http = require('http');
const opn = require('opn');
var request = require('request');


// create some necessary globals
var user = "";
var pass = "";
var groupchoice = "";
var groupchoice2 = "";
var groupchoice3 = "";
var createdGroup = "";
var fileupload = "";
var newuser = "";
var browser;


/*
returns login page to browser
*/
app.get('/', function (req, res) {
    fs.readFile('./pages/home.html', function(err, data){
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(data);
      return res.end();
    })
});


/*
Takes in sign up info from user and sends it to server to check if
this username has been taken already
*/
app.post('/newuser', function(req, res) {

    user = req.body.newusername;
    pass = req.body.newpassword;

    browser = res;

    request.post(
        'http://localhost:8081/checkuser',
        { json: { username: user,
                  password: pass } },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log(body);
            }
        }
    );
});


/*
Takes boolean from server. If true, a new user of that username and pasword
can be created and so a new public key/private key pair for that user can be
generated. These RSA keys are generated using Open SSL. The new user's info and
new public key are sent to the server to be stored in the database. The private
key is stored locally in a json file, only accessable by the client for the
current user. A page letting the user know a new user has been created is then
displayed. Otherwise, user remains on the login page.
*/
app.post('/newuserlogin', function(req, res) {

    var user = req.body.username;
    var pass = req.body.password;
    var b = req.body.b;

    if(b==1){

      var privateKey, publicKey;
      publicKey = '';
      // child process is started to generate key pair
      cp.exec('openssl genrsa 2048', function(err, stdout, stderr) {
        assert.ok(!err);
        privateKey = stdout;
        // private key is stored in a json
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
        // upon completion of the child process ...
        makepub.on('exit', function(code) {
          assert.equal(code, 0);
          // send public key to server.
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
        // public key is created
        makepub.stdout.on('data', function(data) {
          publicKey += data;
        });
        makepub.stdout.setEncoding('ascii');
        makepub.stdin.write(privateKey);
        makepub.stdin.end();
      });

      fs.readFile('./pages/newuser.html', function(err, data){
        browser.writeHead(200, {'Content-Type': 'text/html'});
        browser.write(data);
        return browser.end();
      })
    }
    else{
      fs.readFile('./pages/home.html', function(err, data){
        browser.writeHead(200, {'Content-Type': 'text/html'});
        browser.write(data);
        return browser.end();
      })
    }

});

/*
Takes in login info from user and sends it to the server to check it's validity.
*/
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


/*
Server returns to the client a boolean of whether or not the user login info
was valid. If so, the console is displayed. If not, the user remains at the
login screen.
*/
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


/*
displays console in browser.
*/
app.post('/console', function(req, res){

  fs.readFile('./pages/console.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});


/*
Sends request to the server to get all the group's the current user is
a member of for the purpose of eventually uploading a file.
*/
app.post('/choose', function(req, res) {

  browser = res;

  request.post(
      'http://localhost:8081/sendgroups',
      { json: { user: user,
                dest: 'choosegroup'} },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );

});

/*
Displays page allowing user to choose which group to upload to.
*/
app.post('/choosegroup', function(req, res) {

  var groups = req.body.groups;

  fs.readFile('./pages/choosegroup.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    var result = data.toString('utf-8').replace('{{data}}', groups);
    browser.write(result);
    return browser.end();
  })
});


/*
Displays page to upload a file.
*/
app.post('/upload', function(req, res) {

  groupchoice = req.body.selectpicker;

  fs.readFile('./pages/upload.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});


/*
Handles file uploads. File is saved locally in 'uploadedfiles' directory.
A request is then made to th server to return the group's encrypted symm key.
*/
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


/*
Receives encrypted symmetric key from server, gets user's private key and
decrypts the symmetric key. Then using that it encrypts the contents of
the uploaded file (still only saved locally) and sends it all off to the
server for the encrypted version of the file to be uploaded to the drive.
The console is also displayed.
*/
app.post('/newupload', function(req, res) {

  var symmkey = req.body.symmkey;

  //get private key from json
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
          var pk = key.key; // user's private key found
          mykey = decrypt(symmkey, pk); // decrypt symm key
        }
      });
    }
    if(mykey != ""){
      fs.readFile('./uploadedfiles/' + fileupload, 'utf-8', function(err, contents) {
        if(err){
          console.log(err);
        }
        else{
          //encrypt file contents and sends data to server.
          var encryptedboi = cryptojs.AES.encrypt(contents, mykey);
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


/*
Displays page to create a group
*/
app.post('/create', function(req, res) {

  fs.readFile('./pages/create.html', function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(data);
    return res.end();
  })
});


/*
To create a group a symmetric key for that group must be generated,
and then must be encrypted using the creator's public key. Therefore here a
request is made to the server for the user's public key.
*/
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


/*
Gets group creator's public key form server, generates a symmetric key for the
group and encrypts it, sending the encrypted version along with the groupname
the server for the group to be created in the database and on the drive.
*/
app.post('/getpubkey', function(req, res) {

  var pubkey = req.body.pubkey;

  var symmkey = generateKey();
  var symmEnc = encrypt(symmkey, pubkey);

  request.post(
      'http://localhost:8081/created',
      { json: { groupname: createdGroup,
                symmenc: symmEnc,
                user: user } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );
});


/*
If group creationwas unsuccessful, a page telling the user that is displayed.
Otherwise, we return to the console.
*/
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


/*
Sends request to the server to get all the group's the current user is
a member of for the purpose of eventually downloading a file.
*/
app.post('/choose2', function(req, res) {

  browser = res;

  request.post(
      'http://localhost:8081/sendgroups',
      { json: { user: user,
                dest: 'choosegroup2'} },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );

});


/*
Displays page allowing user to choose which group to download from.
*/
app.post('/choosegroup2', function(req, res) {

  var groups = req.body.groups;

  fs.readFile('./pages/choosegroup2.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    var result = data.toString('utf-8').replace('{{data}}', groups);
    browser.write(result);
    return browser.end();
  })
});


/*
Retrieves the user's group selection and requests the server to get all
files in that group.
*/
app.post('/files', function(req, res) {

  browser = res;

  groupchoice2 = req.body.selectpicker;

  request.post(
      'http://localhost:8081/files',
      { json: { groupname: groupchoice2,
                dest: 'displayfiles' } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );
});



/*
Receives all files in a group from the server and displays them in the browser,
where the user can select which to download.
*/
app.post("/displayfiles", function(req, res) {

  var filenames = req.body.filenames;

  fs.readFile('./pages/files.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    var result = data.toString('utf-8').replace('{{data}}', filenames);
    browser.write(result);
    return browser.end();
  })
});


/*
Gets user-selected file to download and sends a request to the server
to download the encrypted version of the file.
*/
app.post('/downloaded', function(req, res) {
  var filename = req.body.file;
  browser = res;

  request.post(
      'http://localhost:8081/downloaded',
      { json: { file: filename,
                groupname: groupchoice2,
                user: user } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );
});


/*
Retrieves symmetric key for the group from the server, decrypts it using the
current user's private key, then decrypts the recently downloaded file.
The user is returned to the console.
*/
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


/*
Sends request to the server to get all the group's the current user is
a member of for the purpose of eventually inviting another user to a group.
*/
app.post('/invite', function(req, res) {

  browser = res;

  request.post(
      'http://localhost:8081/sendgroups',
      { json: { user: user,
                dest: 'invite2'} },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );

});


/*
Displays page allowing user to invite another user to a group.
*/
app.post('/invite2', function(req, res) {

  var groups = req.body.groups;

  fs.readFile('./pages/invite.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    var result = data.toString('utf-8').replace('{{data}}', groups);
    browser.write(result);
    return browser.end();
  })
});


/*
Takes the name of the user being invited to a group as well as the name of
the group. A request is sent to the server to get the encrypted symmetric
key of the group and the public key of the group's potential new member.
Later that public key will be used to encrypt the group's symmetric key so that
the new member can have their own version of the symmetric key, which can
only be decrypted with their private key.
*/
app.post('/invited', function(req, res) {

  browser = res;

  newuser = req.body.user;
  var group = req.body.selectpicker;

  request.post(
      'http://localhost:8081/symmpub',
      { json: { user1: user,
                user2: newuser,
                group: group } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );
});


/*
The inviting user's version of the group's symmetric key is decrypted with
the inviting member's private key. The decrypted symmetric key is then
re-encrypted with the new member's public key, thereby giving the new member
their own version of the group's symmetric key. The data is then sent to server
for the new member to be added to the group in the database. The user is
returned to the console.
*/
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


/*
Retrieves all group's owned by the current user for the eventual purpose
of removing a user from a group. One can only remove a user from a group if
one owns the group.
*/
app.post('/remove', function(req, res) {

  browser = res;

  request.post(
      'http://localhost:8081/sendownedgroups',
      { json: { user: user,
                dest: 'remove2'} },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );
});


/*
Displays page allowing user to remove a user from a group.
*/
app.post('/remove2', function(req, res) {

  var groups = req.body.groups;

  fs.readFile('./pages/remove.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    var result = data.toString('utf-8').replace('{{data}}', groups);
    browser.write(result);
    return browser.end();
  })

});



/*
Gets the groupname and the user to to removed and sends a request to the
server to perform the removal. The user is returned to the console.
*/
app.post('/removed', function(req, res) {

  browser = res;

  remUser = req.body.user;
  var group = req.body.selectpicker;

  request.post(
      'http://localhost:8081/remove',
      { json: { user1: user,
                user2: remUser,
                group: group } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );

  fs.readFile('./pages/console.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    browser.write(data);
    return browser.end();
  })
});


/*
Retrieves all group's owned by the current user for the eventual purpose
of deleting a group.. One can only delete a group if
one owns the group.
*/
app.post('/delfolder', function(req, res) {

  browser = res;

  request.post(
      'http://localhost:8081/sendownedgroups',
      { json: { user: user,
                dest: 'deletefolder'} },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );
});


/*
Displays page allowing user to delete a group they own
*/
app.post('/deletefolder', function(req, res) {

  var groups = req.body.groups;

  fs.readFile('./pages/deletegroup.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    var result = data.toString('utf-8').replace('{{data}}', groups);
    browser.write(result);
    return browser.end();
  })

});


/*
Gets group to be deleted and sends a request to the server to perform the
deletion. The user is returned to the console.
*/
app.post('/groupdeleted', function(req, res) {

  browser = res;

  var group = req.body.selectpicker;

  request.post(
      'http://localhost:8081/deletegroup',
      { json: { group: group } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );

  fs.readFile('./pages/console.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    browser.write(data);
    return browser.end();
  })
});


/*
sends request to server to get all groups of which the current user is a
member for the purpose of deleting a file from a group. Any member of a group
can delete any file in the group.
*/
app.post('/choose3', function(req, res) {

  browser = res;

  request.post(
      'http://localhost:8081/sendgroups',
      { json: { user: user,
                dest: 'choosegroup3'} },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );
});


/*
Prompts user to choose a group to delete a file from.
*/
app.post('/choosegroup3', function(req, res) {

  var groups = req.body.groups;

  fs.readFile('./pages/choosegroup3.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    var result = data.toString('utf-8').replace('{{data}}', groups);
    browser.write(result);
    return browser.end();
  })
});



/*
Gets user's group choice for file deletion and requests the server to return
all files in that group.
*/
app.post('/deletefiles', function(req, res) {

  browser = res;

  groupchoice3 = req.body.selectpicker;

  request.post(
      'http://localhost:8081/files',
      { json: { groupname: groupchoice3,
                dest: 'displayfiles2' } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );

});


/*
Retrieves all files in the group from the server and displays them to
the user for deletion
*/
app.post("/displayfiles2", function(req, res) {

  var filenames = req.body.filenames;

  fs.readFile('./pages/delete.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    var result = data.toString('utf-8').replace('{{data}}', filenames);
    browser.write(result);
    return browser.end();
  })
});


/*
Gets the file chosen to be deleted and sends a request to the server
for it to perform the deletion. The user is returned to the console.
*/
app.post('/deleted', function(req, res) {
  var filename = req.body.file;

  browser = res;

  request.post(
      'http://localhost:8081/deletefile',
      { json: { file: filename,
                groupname: groupchoice3 } },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log(body);
          }
      }
  );

  fs.readFile('./pages/console.html', function(err, data){
    browser.writeHead(200, {'Content-Type': 'text/html'});
    browser.write(data);
    return browser.end();
  })
});


/*
function to generate a random symmetric key of length of 50 characters.
*/
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


/*
Function to encrypt string using public key. This is done using the
Node module crypto.
*/
var encrypt = function(toEncrypt, publicKey) {
    var buffer = Buffer.from(toEncrypt);
    var encrypted = crypto.publicEncrypt(publicKey, buffer);
    return encrypted.toString("base64");
};


/*
Function to decrypt string using private key. This is done using the
Node module crypto.
*/
var decrypt = function(toDecrypt, privateKey) {
    var buffer = Buffer.from(toDecrypt, "base64");
    var decrypted = crypto.privateDecrypt(privateKey, buffer);
    return decrypted.toString("utf8");
};


/*
function to decrypt a file. It goes to where the encrypted file is stored
locally, uses the module Crypto-JS to decrypt the contents
using symmetric encryption, and writes the decrypted contents back to the file
*/
function decryptFile(name, sym){

  fs.readFile('./downloadedfiles/' + name, 'utf8', function(err, data){
    if(err){
      console.log(err);
    }

    var dec = cryptojs.AES.decrypt(data, sym);
    fs.writeFile('./downloadedfiles/' + name, dec.toString(cryptojs.enc.Utf8), 'utf8', function(err){
      if(err){
        console.log(err);
      }
    });
  });
}


app.listen(8080, function () {
    console.log('Listening on http://localhost:8080');
});
