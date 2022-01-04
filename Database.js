const { MongoClient, ObjectID } = require('mongodb');	// require the mongodb driver

/**
 * Uses mongodb v3.6+ - [API Documentation](http://mongodb.github.io/node-mongodb-native/3.6/api/)
 * Database wraps a mongoDB connection to provide a higher-level abstraction layer
 * for manipulating the objects in our cpen322 app.
 */
function Database(mongoUrl, dbName){
	if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
	this.connected = new Promise((resolve, reject) => {
		MongoClient.connect(
			mongoUrl,
			{
				useNewUrlParser: true
			},
			(err, client) => {
				if (err) reject(err);
				else {
					console.log('[MongoClient] Connected to ' + mongoUrl + '/' + dbName);
					resolve(client.db(dbName));
				}
			}
		)
	});
	this.status = () => this.connected.then(
		db => ({ error: null, url: mongoUrl, db: dbName }),
		err => ({ error: err })
	);
}

Database.prototype.getRooms = function(){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: read the chatrooms from `db`
			 * and resolve an array of chatrooms */
            db.collection('chatrooms').find({}).toArray((err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
		})
	)
}

Database.prototype.getRoom = function(room_id){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: read the chatroom from `db`
			 * and resolve the result */
            let id;

            // mongodb.ObjectID type should get priority
            try {
                id = ObjectID(room_id);
            } catch (err) {
                id = room_id;
            }
            
            db.collection('chatrooms').find({_id: id}).toArray((err, result) => {
                if (err) reject(err);
                // If the document does not exist, the Promise should resolve to null
                else if (result.length === 0) resolve(null);
                else resolve(result[0]);
            });
		})
	)
}

Database.prototype.addRoom = function(room){
	return this.connected.then(db => 
		new Promise((resolve, reject) => {
			/* TODO: insert a room in the "chatrooms" collection in `db`
			 * and resolve the newly added room */
            if (room.name) {
                db.collection('chatrooms').insertOne(room, (err, result) => {
                    if (err) reject(err);
                    else resolve(room);
                });
            } else {
                // If the name field in the room object is not provided
                // the Promise should reject with an Error
                reject('Room name is required');
            }
		})
	)
}

Database.prototype.getLastConversation = function(room_id, before){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: read a conversation from `db` based on the given arguments
			 * and resolve if found */
            let time;
            if (!before) time = Date.now();
            else time = parseInt(before);

            db.collection('conversations').find({ 
                $and: [{ room_id: room_id }, 
                    { timestamp: { $lt: time } 
                }] }).sort({timestamp: -1}).toArray((err, result) => {
                if (err) reject(err);
                // The Promise should resolve to null if no Conversation was found
                else if (result.length === 0) resolve(null);
                else resolve(result[0]);
            });
		})
	)
}

Database.prototype.addConversation = function(conversation){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: insert a conversation in the "conversations" collection in `db`
			 * and resolve the newly added conversation */
            if (conversation.room_id && conversation.timestamp && conversation.messages) {
                db.collection('conversations').insertOne(conversation, (err, result) => {
                    if (err) reject(err);
                    else resolve(conversation);
                });
            } else {
                reject('Conversation is missing required fields');
            }
		})
	)
}

/**
 * It accepts a single username argument 
 * and queries the users collection for a document 
 * with the username field equal to the given username. 
 * 
 * @param {*} username 
 * @returns a Promise that resolves to the user document if found, null otherwise
 */
Database.prototype.getUser = function(username){
    return this.connected.then(db => new Promise((resolve, reject) => {
        let collection = db.collection('users');
        let query = { 
            username: username 
        };
        collection.find(query).toArray((err, result) => {
            if (err) reject(err);
            else if (result.length === 0) resolve(null);    // resolve null if no user was found
            else resolve(result[0]);
        })
    }));
}

module.exports = Database;