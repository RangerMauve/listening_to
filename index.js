var express = require("express");
var body_parser = require("body-parser")();
var sockjs = require("sockjs");
var path = require("path");
var fs = require("fs");
var Promise = require("es6-promise").Promise;
var http = require("http");

var app = express();
var songs = getSongs();
var listeners = {};
var listenerServer = sockjs.createServer();

listenerServer.on("connection", function (listener) {
	var id;
	listener.once("data", function (data) {
		data = JSON.parse(data);
		id = data;
		console.log(id,"connected");
		listeners[id] = {
			id: id,
			socket: listener,
			updated: Date.now()
		};
		listener.on("data", function (data) {
			data = JSON.parse(data);
			var type = data.type || "message";
			listener.emit(type, data);
		});
	});
	listener.on("song", function (data) {
		var song = data.song;
		console.log(id,"now listening to",song);
		listeners[id].song = song;
		listeners[id].updated = Date.now();
	});
	listener.on("stopped", function (data) {
		console.log(id,"stopped listening");
		listeners[id].song = "";
		listeners[id].updated = Date.now();
	});
	listener.on("close", function () {
		console.log(id,"disconnected");
		delete listeners[id];
	});
});

app.get("/songs", function (req, res) {
	songs.then(function (songs) {
		res.json(songs);
	}).catch(function (err) {
		res.json(500, songs);
	});
});

app.get("/listening", function (req, res) {
	var songs = Object.keys(listeners).map(function(id){
		return listeners[id];
	}).filter(function (listener) {
		return !!listener.song;
	}).sort(function (plistener, listener) {
		return plistener.updated < listener.updated;
	}).map(function (listener) {
		return {
			id: listener.id,
			song: listener.song
		};
	});
	console.log("User getting listener list",songs,"from",listeners);
	res.json(songs);
});

app.use(express.static(path.join(__dirname, "static")));
app.use("/bower_components", express.static(path.join(__dirname, "bower_components")));

var server = http.createServer(app);
listenerServer.installHandlers(server, {
	prefix: "/messages"
});

server.listen(process.env.PORT || 80);


function getSongs() {
	return new Promise(function (resolve, reject) {
		fs.readdir(path.join(__dirname, "static/songs"), function (err, files) {
			if (err) reject(err);
			else resolve(files);
		})
	});
}
