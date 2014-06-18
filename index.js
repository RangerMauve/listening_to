// Get modules
var express = require("express");
var body_parser = require("body-parser")();
var sockjs = require("sockjs");
var path = require("path");
var fs = require("fs");
var Promise = require("es6-promise").Promise;
var http = require("http");

// Create app
var app = express();

// Create promise for getting song list
var songs = getSongs();

// Make map of listenerid-{id,song}
var listeners = {};

// Make SockJS server for websockets
var listenerServer = sockjs.createServer();

// Called when SockJS gets a new connection
listenerServer.on("connection", function (listener) {
	// Make variable for setting the listenerid later
	var id;

	// First time data is sent, it'll be their id
	listener.once("data", function (data) {
		data = JSON.parse(data); // Parse data as JSON
		id = data; // Set the id to their data
		console.log(id, "connected");
		// Register their data in the listeners map
		listeners[id] = {
			id: id,
			updated: Date.now(),
			socket: listener
		};
		// Set up actual data listener
		listener.on("data", function (data) {
			data = JSON.parse(data);
			// Parse out event type if it exists, else set it to "message"
			var type = data.type || "message";
			// Emit the event with the parsed data
			listener.emit(type, data);
		});
	});
	listener.on("song", function (data) {
		// Event for changing the currently lsitened-to song
		var song = data.song;
		console.log(id, "now listening to", song);
		// Update the user's current song
		listeners[id].song = song;
		// Update timestamp for sorting
		listeners[id].updated = Date.now();
		// Whenever you change your song, broadcast the change
		broadcast({
			type: "change_song",
			song: song,
			id: id
		});
	});
	listener.on("stopped", function (data) {
		// Event for when user stops listening to anything
		console.log(id, "stopped listening");
		listeners[id].song = "";
		listeners[id].updated = Date.now();
	});
	listener.on("close", function () {
		// Called when the websocket is closed
		console.log(id, "disconnected");
		// Delete the listener's data from the map
		delete listeners[id];
	});
});

// Gets the available song list
app.get("/songs", function (req, res) {
	songs.then(function (songs) {
		res.json(songs);
	}).catch(function (err) {
		res.json(500, songs);
	});
});

// Gets the current listeners and what songs they're listening to
app.get("/listening", function (req, res) {
	// Get a list of all the ids of the listeners
	var songs = Object.keys(listeners)
		.map(function (id) { // Map an array with the listener data
			return listeners[id];
		}).filter(function (listener) { // Filter out listeners that aren't listening to anything
			return !!listener.song;
		}).sort(function (plistener, listener) { // Sort listeners by most recently updated
			return plistener.updated < listener.updated;
		}).map(function (listener) { // Get onlt their id and song
			return {
				id: listener.id,
				song: listener.song
			};
		});
	console.log("User getting listener list", songs, "from", listeners);
	res.json(songs); // Return the data as a JSON array
});

// Serve static files like songs and index.js
app.use(express.static(path.join(__dirname, "static")));

// Serve static files in bower modules
app.use("/bower_components", express.static(path.join(__dirname, "bower_components")));

// Create an HTTP server and mount the express app on it
var server = http.createServer(app);

// Mount the SockJS server on the HTTP server
listenerServer.installHandlers(server, {
	prefix: "/messages"
});

// Listen to PORT provided by Heroku or default (80)
server.listen(process.env.PORT || 80);

function broadcast(data) {
	Object.keys(listeners).map(function (id) {
		return listeners[id];
	}).forEach(function (listener) {
		var sock = listener.socket;
		sock.write(JSON.stringify(data));
	});
}

// Returns a promise that resolves to the list of songs `in static/songs/`
function getSongs() {
	return new Promise(function (resolve, reject) {
		fs.readdir(path.join(__dirname, "static/songs"), function (err, files) {
			if (err) reject(err);
			else resolve(files);
		})
	});
}
