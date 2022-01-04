const cpen322   = require('./cpen322-tester.js');
const path      = require('path');
const fs        = require('fs');
const ws        = require('ws');
const express   = require('express');
const Database  = require('./Database.js');
const crypto    = require('crypto');

// This number will indicate how many messages to include in a conversation.
const messageBlockSize = 10;

// mongoUrl is the address of the MongoDB service you want to connect to
const mongoURL = 'mongodb://localhost:27017';
// dbName is defined in initdb.mongo
const dbName = 'cpen322-messenger';
const db = new Database(mongoURL, dbName);

const broker = new ws.Server({port: 8000});

const SessionManager = require('./SessionManager.js');
const sessionManager = new SessionManager();

let messages = {
	roomid_1: [],
	roomid_2: [],
	roomid_3: [],
	roomid_4: []
}

function getMessages() {
	db.getRooms().then((rooms) => {
		rooms.forEach(room => {
			messages[room._id] = [];
		})
	});
}

function isCorrectPassword(password, saltedHash) {
    // first 20 characters
    let salt = saltedHash.substring(0, 20);
    // remaining 44 characters
    let base64 = saltedHash.substring(20);
    let saltedPassword = password + salt;
    return base64 === crypto.createHash('sha256').update(saltedPassword).digest('base64');
}

function logRequest(req, res, next){
	console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
	next();
}

const host = 'localhost';
const port = 3000;
const clientApp = path.join(__dirname, 'client');

// express app
let app = express();

app.use(express.json()) 						// to parse application/json
app.use(express.urlencoded({ extended: true })) // to parse application/x-www-form-urlencoded
app.use(logRequest);							// logging for debug

app.use('/chat/:room_id/messages', sessionManager.middleware);
app.use('/chat/:room_id', sessionManager.middleware);
app.use('/chat', sessionManager.middleware);
app.use('/profile', sessionManager.middleware);

app.route('/chat')
	.get(function(req, res, next) {
        /*
		let roomsWithMessage = Array.from(chatrooms).map((room) => Object.assign({messages: messages[room.id]}, room));
		res.status(200).send(JSON.stringify(roomsWithMessage));
		res.end();
        */
        let result = [];
        db.getRooms().then(rooms => {
            rooms.forEach(room => {
                getMessages();
                result.push({_id: room._id, name: room.name, image: room.image, messages: messages[room._id]});
            });
            res.status(200).send(result);
        });
	})
	.post(function(req, res, next) {
		db.addRoom(req.body).then(result => {
            getMessages();
            res.status(200).send(JSON.stringify(result));
        }).catch(err => {res.status(400).send(err)});
    });

app.route('/chat/:room_id')
    .get(function(req, res, next) {
        let roomId = req.params.room_id;
        db.getRoom(roomId).then(room => {
            // If the Room was not found, return HTTP 404 with an error message
            if (room === null) res.status(404).send("Room " + roomId + " was not found");
            else res.status(200).send(room);
        });
    })


app.route('/chat/:room_id/messages')
    .get(function(req, res, next) {
        db.getLastConversation(req.params.room_id, req.query.before).then(conversation => {
            if (conversation === null) res.status(404).send("Conversation for room " + req.params.room_id + "at" + req.query.before + " was not found");
            else res.status(200).send(conversation);
        });
    });


app.route('/login')
    .post(function(req, res, next) {
        let username = req.body.username;
        let password = req.body.password;
        let maxAge = req.body.maxAge;
        db.getUser(username).then(result => {
            // If the user is not found, redirect back to the login page
            if (result === null) res.redirect('/login');
            else {
                if (isCorrectPassword(password, result.password)) {
                    // If the password is correct, create a new user session
                    console.log("Correct password.");
                    sessionManager.createSession(res, username);
                    res.redirect('/');
                } else {
                    // If the password is incorrect, redirect back to the login page.
                    console.log("Incorrect password.")
                    res.redirect('/login');
                }
            }
        });
    });

app.route('/profile')
    .get(function(req, res, next) {
        res.status(200).send({ username: req.username });
});

app.route('/logout')
    .get(function(req, res, next) {
        sessionManager.deleteSession(req);
        res.redirect('/login');
});

app.listen(port, () => {
	console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});

broker.on('connection', (client, request) => {
    let cookie = request.headers.cookie;
    if (cookie == null || sessionManager.getUsername(cookie.split('=')[1]) == null) {
        broker.clients.forEach(c => {
            if (c === client && c.readyState === ws.OPEN) c.close();
        });
    }
	client.on('message', (data) => {
		let message = JSON.parse(data);

        if (message.text.includes("<img") || message.text.includes("<button") || message.text.includes("</button") || message.text.includes("<div")) {
			message.text = " ";
		}

        let username = sessionManager.getUsername(cookie.split('=')[1]);
        message.username = username;

		let msg = {username: message.username, text: message.text};
		broker.clients.forEach((newClient) => {
			if (newClient !== client) {
				newClient.send(JSON.stringify(message));
			}
		});
		if (!messages[message.roomId]) {
			messages[message.roomId] = [];
			messages[message.roomId].push(msg);
		} else {
			messages[message.roomId].push(msg);
		}

        // a4 added
        if (messages[message.roomId].length === messageBlockSize) {
            let newConversation = {
                room_id: message.roomId,
                timestamp: Date.now(),
                messages: messages[message.roomId]
            };

            db.addConversation(newConversation).then(result => {
                console.log('input conversation is ', newConversation);
                messages[message.roomId] = [];
            });
        }
	})
});

app.use('/app.js', sessionManager.middleware, express.static(clientApp + '/app.js'));
app.use('/index.html', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.use('/index', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.use('[/]', sessionManager.middleware, express.static(clientApp + '[/]'));

// serve static files (client-side)
app.use('/', express.static(clientApp, { extensions: ['html'] }));

app.use(sessionManager.middlewareErrorHandler);

cpen322.connect('http://99.79.42.146/cpen322/test-a5-server.js');
cpen322.export(__filename, { app, db, messages, messageBlockSize, sessionManager, isCorrectPassword });
