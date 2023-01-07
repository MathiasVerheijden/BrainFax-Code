var session;
var library;

//Check if local storage contains a variable called session
if (localStorage.getItem("session") == null) {
    window.location.href = "index.html"; //Without session name, redirect to login page
} else if (localStorage.getItem("session") == "") {
    window.location.href = "index.html"; //Without session name, redirect to login page
} else {
    session = localStorage.getItem("session");
}

// Add event listener for socket on port 3100, and check for it to connect
const socket = io('http://localhost:3100');

//When server acknowledges connection (by sending 'entered'), ask to join room stored in local storage
socket.on("enter", status => {
    if (status == "entered") {
        socket.emit("join", session);

        //It will also remove the existing board frame (in case of a page reload) to make place for a new one
        console.log("Joined session called: " + session + ". Refresing board frame");
        var board = document.getElementById('miro-board');
        board.remove();
    }
});

//When the Miro Board ID is receieved, render the miro board as iframe using the ID
socket.on("join-board", boardID => {
    //Render an iframe with the board ID
    console.log(boardID)
    var wrapper = document.getElementById('miro-wrapper');
    var iframe = document.createElement('iframe');
    iframe.src = "https://miro.com/app/live-embed/" + boardID
    iframe.className = 'img-fluid miro-board px-0';
    iframe.allowFullscreen = true;
    iframe.id = "miro-board";
    wrapper.appendChild(iframe);
});


