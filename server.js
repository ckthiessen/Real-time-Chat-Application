let express = require("express");
let app = express();
var favicon = require("serve-favicon");
let http = require("http").Server(app);
let io = require("socket.io")(http);
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const options = {
  timeZone: "America/Edmonton",
  hour12: true,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
};

var userCount = 0;
var messages = []; // This object should contain the sessionID instead of the username cause username can change and session ID can be used to track their color changes but username can't (for previous reason)
var sessions = new Map();
var users = [];

app.use(express.static(path.join(__dirname, "public")));
app.use(favicon(path.join(__dirname, "public", "favicon.png"))); //Why won't this load?

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// Known bugs 
// Not sending messages to everyone
// Not showing proper user count
// Not updating other clients colors

io.on("connection", socket => {
  userCount++;
  let username;
  let session;
  io.emit("joined", userCount);
  socket.emit("get messages", messages);

  socket.on("get session", id => {
    if (sessions.has(id)) {
      username = sessions.get(id).username;
      let color = sessions.get(id).color;

      session = {
        id,
        username,
        color
      };

      socket.emit("set session", session);
    } else {
      username = "user" + userCount;

      let sessionId = uuidv4();

      session = {
        username,
        color: "black"
      };

      sessions.set(sessionId, session); // Would like to use a UUID to create a session ID that will be stored in a cookie.

      socket.emit("set session", {
        id: sessionId,
        username: session.username,
        color: session.color
      });
    }
    console.log(username + " connected");
    console.log("Sessions after setting sessions: " + sessions);
    users.push(username);
    let message = {
      text: username + " has joined the chat",
      username: username,
      color: session.color,
      timeStamp: new Date().toLocaleTimeString("en-US", options)
    };
    messages.push(message);
    io.emit("chat message", message);
  });

  // Optimize so we aren't sending all messages every time
  // Should this be socket.emit or io.emit?
  // If I do io.emit then we are sending the entire chat history to every client unnecessarily when a new user connects

  socket.on("set username", request => {
    let sessionId = request.sessionId;
    let session = sessions.get(sessionId);

    let newUsername = request.newUsername;
    // Check if the server already has a session with the new username

    let usernameTaken = false;
    sessions.forEach(session => {
      if (session.username === newUsername) {
        usernameTaken = true;
      }
    });

    if (usernameTaken) {
      // Need to test
      let message = {
        text: "That name is already being used by another user. Please select a new username.",
        username: "server",
        color: "black",
        timeStamp: new Date().toLocaleTimeString("en-US", options)
      };
      socket.emit("chat message", message);
      return;
    }
    let oldUsername = session.username;
    session.username = newUsername;

    socket.emit("set username", newUsername);

    let message = {
      text: oldUsername + " has changed their name to " + newUsername,
      username: newUsername,
      color: session.color,
      timeStamp: new Date().toLocaleTimeString("en-US", options)
    };
    io.emit("chat message", message);
    // socket.emit("set all sessions", sessions);
  });

  socket.on("set color", request => {
    let sessionId = request.sessionId;
    let session = sessions.get(sessionId);

    let newColor = request.newColor;
    session.color = newColor;
    console.log("Session after setting color: " + session);

    io.emit("set color", { username: session.username, color: newColor });
    // socket.emit("set all sessions", sessions);
  });

  socket.on("leave", sessionId => {
    let leavingUser = sessions.get(sessionId).username;

    let message = {
      text: leavingUser + " has left the chat",
      username: "server",
      color: "black",
      timeStamp: new Date().toLocaleTimeString("en-US", options)
    };

    console.log("Sessions after leaving: \n" + sessions);

    messages.push(message);
    socket.broadcast.emit("chat message", message);

    io.emit("leave", --userCount);
    // socket.emit("set all sessions", sessions);
  });

  socket.on("chat message", msg => {
    console.log("Chat message received at server: " + msg);
    // Remember most recent 200 messages
    msg.timeStamp = new Date().toLocaleTimeString("en-US", options);
    messages.length > 200
      ? () => {
          messages.shift();
          messages.push(msg);
        }
      : messages.push(msg);

    // If use socket.broadcast.emit then client won't get the timestamp
    io.emit("chat message", msg);
  });
});

http.listen(3000, () => {
  console.log("Listening on port *:3000");
});
