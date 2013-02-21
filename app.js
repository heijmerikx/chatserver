var express = require('express');
var app = express();
var http = require('http');
var server = http.createServer(app).listen(8080);
var io = require('socket.io').listen(server);

var redis = require('redis');

if (process.env.REDISTOGO_URL) {
  // TODO: redistogo connection
  var rtg   = require("url").parse(process.env.REDISTOGO_URL);
  var redis = require("redis").createClient(rtg.port, rtg.hostname);
  redis.auth(rtg.auth.split(":")[1]);
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
    redisClient.lpush('clients', name);
    // and notify all connnected clients of the newly joined client
    var clients = redisClient.lrange("clients", 0 , -1, function(err, clients){
      io.sockets.emit('clients', clients);
    });
    
  });

  // client on disconnect
  client.on('disconnect', function(){
    // remove the client from the clients list
    client.get('nickname',function(err, name){
      redisClient.lrem('clients', 0, name);
    });
    
    // and update all clients of this change
    var clients = redisClient.lrange("clients", 0 , -1, function(err, clients){
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