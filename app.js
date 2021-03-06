var express = require('express');
var app = express();
var http = require('http');
var server = http.createServer(app).listen(8080);
var io = require('socket.io').listen(server);

var redis = require('redis');

if (process.env.NODE_ENV == "production") {  
  var redisClient = require("redis").createClient(6379, "nodejitsudb2911129160.redis.irstack.com");
  redisClient.auth("nodejitsudb2911129160.redis.irstack.com:f327cfe980c971946e80b8e975fbebb4", function(err){
    if (err) {
      throw err;
    }
  });
} else {
  var redisClient = redis.createClient();
}

// display the index.html page for rendering the chatroom.
app.get("/", function(req, res){
  res.sendfile(__dirname + '/public/index.html');
});
app.use("/styles", express.static(__dirname + '/public/styles'));

// handling the socket.io traffic
io.sockets.on('connection',function(client) {

  client.get('nickname',function(err, name){
    console.log(name);
    if (name !== null) {
      redisClient.sadd('clients', name);
    }
  });

  var clients = redisClient.smembers("clients", function(err, clients){
    io.sockets.emit('clients', clients);      
  });

  // Give the connecting client the last 20 messages 
  // that were send to the chat server and where persisted by redis
  redisClient.lrange("messages", 0, 19, function(err, messages) {
    messages = messages.reverse();
    messages.forEach(function(message) {
      client.emit('messages', message);
    });
  });

  // send welcome message
  console.log("Client connected...");
  client.emit("welcome", {hello: 'Hi there, welcome.'});

  // set the (nick)name for the client
  client.on('join', function(name){
    client.set('nickname', name);
    // add the connecting client to the list of active clients
    redisClient.sadd('clients', name);
    // and notify all connnected clients of the newly joined client
    var clients = redisClient.smembers("clients", function(err, clients){
      io.sockets.emit('clients', clients);      
    });
    
  });

  // client on disconnect
  client.on('disconnect', function(){
    // remove the client from the clients list
    client.get('nickname',function(err, name){
      redisClient.srem('clients', name);
      console.log(name + " disconnected!");
    });
    
    // and update all clients of this change
    var clients = redisClient.smembers("clients", function(err, clients){
      io.sockets.emit('clients', clients);
    });
  });

  // handle incoming messages and broadcast them to all clients
  client.on('messages', function(data){
    console.log("Broadcasting message...");
    client.get('nickname',function(err, name){
      var message = name + ": " + data
      io.sockets.emit("messages", message);
      // persist the message (only the last 20 that is)
      redisClient.lpush('messages', message, function(err, reply){
        redisClient.ltrim('messages', 0, 20);
      });
    });
    
  });

});