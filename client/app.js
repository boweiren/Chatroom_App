const index_page =
    `<div class="content">
        <ul class="room-list">
        </ul>
        <div class="page-control">
            <input type="text" placeholder="Room Title">
            <button>Create Room</button>
        </div>
    </div>`;

const chat_page =
    `<div class="content">
        <h4 class="room-name">Everyone in CPEN322</h4>
            <div class="message-list">
            </div>
        <div class="page-control">
            <textarea>textarea</textarea>
            <button>send</button>
        </div>
    </div>`;

const profile_page =
    `<div class="content">
        <div class="profile-form">
            <div class="form-field">
                <label>Username</label>
                <input type="text"><br>
                <label>Password</label>
                <input type="text"><br>
                <label>Avatar Image</label>
                <input type="text"><br>
                <label>About</label>
                <input type="text"><br>
            </div>
        </div>
        <div class="page-control">
            <button>Save</button>
        </div>
    </div>`;

let profile = {username: 'Alice'};

let Service = {
    origin: window.location.origin,
    getAllRooms: function() {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', this.origin + "/chat");
            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(xhr.responseText));
                }
            };
            xhr.onerror = () => {
                reject(new Error('Client error: ' + xhr.responseText));
            }
            xhr.send();
        });
    },
    addRoom: function(data) {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open('POST', this.origin + "/chat");
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(xhr.responseText));
                }
            };
            xhr.onerror = () => {
                reject(new Error('Client error: ' + xhr.responseText));
            }
            xhr.send(JSON.stringify(data));
        });
    },
    getLastConversation: function(room_id, before) {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', this.origin + "/chat/" + room_id + "/messages" + "?before=" + encodeURI(before));
            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(xhr.responseText));
                }
            };
            xhr.onerror = () => {
                reject(new Error('Client error: ' + xhr.responseText));
            }
            xhr.send();
        });
    },
    getProfile: function() {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', this.origin + "/profile");
            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(xhr.responseText));
                }
            };
            xhr.onerror = () => {
                reject(new Error('Client error: ' + xhr.responseText));
            }
            xhr.send();
        });
    }
};

// Removes the contents of the given DOM element (equivalent to elem.innerHTML = '' but faster)
function emptyDOM(elem) {
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

// Creates a DOM element from the given HTML string
function createDOM(htmlString) {
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

// The generator function will "remember" the last conversation fetched
// and incrementally fetch the conversations as the user scrolls to the top of the chat view
// until there is no more conversation blocks to be read
function* makeConversationLoader(room) {
    let lastTime = room.crateTime;
    while (room.canLoadConversation && lastTime > 0) {
        room.canLoadConversation = false;
        yield new Promise((resolve, reject) => {
            Service.getLastConversation(room.id, lastTime).then(conversation => {
                if(conversation){
                    lastTime = conversation.timestamp;
                    room.canLoadConversation = true;
                    room.addConversation(conversation);
                    resolve(conversation);
                } else {
                    resolve(null);
                }
            }, error => {
                console.log(error);
                resolve(null);
            });
        })
    }
}

class LobbyView {
    constructor(lobby) {
        this.lobby = lobby;

        // create the DOM for the "lobby page"
        this.elem = createDOM(index_page);

        this.listElem = this.elem.querySelector('ul.room-list');
        this.inputElem = this.elem.querySelector('.page-control input');
        this.buttonElem = this.elem.querySelector('.page-control button');
        
        this.buttonElem.addEventListener('click', () => {
            let input = this.inputElem.value.toString();
            //this.lobby.addRoom(input, input, 'assets/everyone-icon.png', []);
            Service.addRoom({name: input, image: 'assets/everyone-icon.png'})
                .then((room) => {
                    this.lobby.addRoom(room._id, room.name, room.image);
                    this.lobby.newId += 1;
                })
                .catch(error => error)
            this.inputElem.value = '';
        });

        this.lobby.onNewRoom = (room) => {
            this.redrawList();
        };

        this.redrawList();
    }

    redrawList() {
        emptyDOM(this.listElem);
        for (let id in this.lobby.rooms) {
            let room = this.lobby.rooms[id];
            let a = document.createElement('a');
            a.setAttribute('href', '#/chat/' + room.id);
            let img = document.createElement('img');
            img.setAttribute('src', room.image);
            img.setAttribute('alt', room.id);
            let span = document.createElement('span');
            span.innerText = room.name;
            a.appendChild(img);
            a.appendChild(span);
            let li = document.createElement('li');
            li.appendChild(a);
            this.listElem.appendChild(li);
        }
    }
}

class ChatView {
    constructor(socket) {
        this.room = null;
        this.socket = socket;

        // create the DOM for the "chat page"
        this.elem = createDOM(chat_page);

        this.titleElem = this.elem.querySelector('h4.room-name');
        this.chatElem = this.elem.querySelector('div.message-list');
        this.inputElem = this.elem.querySelector('.page-control textarea');
        this.buttonElem = this.elem.querySelector('.page-control button');

        this.buttonElem.addEventListener('click', () => {this.sendMessage();});
        this.inputElem.addEventListener('keyup', (event) => {
            if (!event.shiftKey && event.keyCode === 13) this.sendMessage();
        });

        this.chatElem.addEventListener('wheel', (event) => {
            if (event.deltaY < 0 && this.chatElem.scrollTop === 0 && this.room.canLoadConversation) {
                this.room.getLastConversation.next();
            }
        });
    }

    sendMessage() {
        let input = this.inputElem.value.toString();
        this.room.addMessage(profile.username, input);
        let msg = {
            roomId: this.room.id,
            username: profile.username,
            text: input
        };
        this.socket.send(JSON.stringify(msg));
        this.inputElem.value = '';
    }

    setRoom(room) {
        this.room = room;
        this.titleElem.innerHTML = this.room.name;
        emptyDOM(this.chatElem);
        
        for (let message in room.messages) {
            if (room.messages[message].username === profile.username) {
                let tmp = createDOM(`<div class="message my-message">
                <span class="message-user">${room.messages[message].username}</span><br>
                <span class="message-text">${room.messages[message].text}</span><br>
                </div>`);
                this.chatElem.appendChild(tmp);
            } else {
                let tmp = createDOM(`<div class="message">
                <span class="message-user">${room.messages[message].username}</span><br>
                <span class="message-text">${room.messages[message].text}</span><br>
                </div>`);
                this.chatElem.appendChild(tmp);
            }
        }

        this.room.onNewMessage = (message) => {
            if (message.username === profile.username) {
                let tmp = createDOM(`<div class="message my-message">
                <span class="message-user">${message.username}</span><br>
                <span class="message-text">${message.text}</span><br>
                </div>`);
                this.chatElem.appendChild(tmp);
            } else {
                let tmp = createDOM(`<div class="message">
                <span class="message-user">${message.username}</span><br>
                <span class="message-text">${message.text}</span><br>
                </div>`);
                this.chatElem.appendChild(tmp);
            }
        }

        this.room.onFetchConversation = (conversation) => {
            let hb = this.chatElem.scrollHeight;
            conversation.messages.forEach((message) => {
                if (message.username === profile.username) {
                    let tmp = createDOM(`<div class="message my-message">
                    <span class="message-user">${message.username}</span><br>
                    <span class="message-text">${message.text}</span><br>
                    </div>`);
                    this.chatElem.prepend(tmp);
                } else {
                    let tmp = createDOM(`<div class="message">
                    <span class="message-user">${message.username}</span><br>
                    <span class="message-text">${message.text}</span><br>
                    </div>`);
                    this.chatElem.prepend(tmp);
                }
            })
            conversation.messages.reverse();
            let ha = this.chatElem.scrollHeight;
            this.chatElem.scrollTop = ha - hb;
        };
    }
}

class ProfileView {
    constructor() {
        // create the DOM for the "profile page"
        this.elem = createDOM(profile_page);
    }
}

class Room {
    constructor(id, name, image = 'assets/everyone-icon.png', messages = []) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.messages = messages;
        this.crateTime = Date.now();
        this.getLastConversation = makeConversationLoader(this);
        this.canLoadConversation = true;
    }

    addMessage(username, text) {
        if (text === '' || text.trim() === '') return;
        else {
            let message = {
                username: username,
                text: text
            };
            if (text.includes("<img") || text.includes("<button") || text.includes("</button") || text.includes("<div")) message.text = " ";
            this.messages.push(message);
            if(typeof(this.onNewMessage) === typeof(Function)) {
                this.onNewMessage({
                    username: username,
                    text: text
                });
            }
        }
    }

    addConversation(conversation) {
           for (let msg of conversation.messages) {
               this.messages.push(msg);
           }
           this.onFetchConversation(conversation);
    }
}

class Lobby {
    constructor() {
        this.rooms = {};
        this.newId = 5;

        //let room_1 = new Room('roomid_1', 'room_1', 'assets/everyone-icon.png');
        //let room_2 = new Room('roomid_2', 'room_2', 'assets/bibimbap.jpg');
        //let room_3 = new Room('roomid_3', 'room_3', 'assets/minecraft.jpg');
        //let room_4 = new Room('roomid_4', 'room_4', 'assets/canucks.png');

        //this.rooms[room_1.id] = room_1;
        //this.rooms[room_2.id] = room_2;
        //this.rooms[room_3.id] = room_3;
        //this.rooms[room_4.id] = room_4;
    }

    getRoom(roomId) {
        return this.rooms[roomId];
    }

    addRoom(id, name, image, messages) {
        let newRoom = new Room(id, name, image, messages);
        this.rooms[id] = newRoom;
        if (typeof(this.onNewRoom) === typeof(Function)) {
            this.onNewRoom(newRoom);
        }
    }

}

function main() {

    let lobby = new Lobby();

    let lobbyView = new LobbyView(lobby);
    //let chatView = new ChatView();
    let profileView = new ProfileView();

    let socket = new WebSocket('ws://localhost:8000');
    socket.addEventListener('message', (message) => {
        let message_obj = JSON.parse(message.data);
        let room = lobby.getRoom(message_obj.roomId);
        room.addMessage(message_obj.username, message_obj.text);
    });

    let chatView = new ChatView(socket);

    // render pages dynamically based on the URL
    function renderRoute() {

        let route = window.location.hash.split('/')[1];

        if (route === '') {
            emptyDOM(document.getElementById('page-view'));
            document.getElementById('page-view').appendChild(lobbyView.elem);
        } else if (route === 'chat') {
            let chat = window.location.hash.split('/')[2];
            let room = lobby.getRoom(chat);
            if (room != null) {
                chatView.setRoom(room);
            }
            emptyDOM(document.getElementById('page-view'));
            document.getElementById('page-view').appendChild(chatView.elem);
        } else if (route === 'profile') {
            emptyDOM(document.getElementById('page-view'));
            document.getElementById('page-view').appendChild(profileView.elem);
        }
    }

    function refreshLobby() {
        let promise = Service.getAllRooms();

        promise.then( (list) => {
                for(let i = 0; i < list.length; i++) {
                    let roomId = list[i]._id;
                    let curRoom = lobby.getRoom(roomId);
                    if(curRoom) {
                        curRoom.name = list[i].name;
                        curRoom.image = list[i].image;
                    } else {
                        let id = list[i]._id;
                        let name = list[i].name;
                        let image = list[i].image;
                        let messages = list[i].messages;

                        lobby.addRoom(id, name, image, messages);
                    }
                }
            },
            err => err);
    }


    //setInterval(refreshLobby, 500);

    window.addEventListener('popstate', renderRoute);

    // call the renderRoute function once
    // so that the appropriate page is rendered upon page load
    renderRoute();
    refreshLobby();
    setInterval(refreshLobby, 5000);

    Service.getProfile().then((p) => {
        console.log('username before:' + profile.username);
        console.log('username after:' + p.username);
        if (p != null) {
            profile.username = p.username;
        }
    });

    cpen322.export(arguments.callee, {
        chatView,
        lobby
    });
}

window.addEventListener('load', main);
