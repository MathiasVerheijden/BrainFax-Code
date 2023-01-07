//Login Page Script

var form = document.getElementById("login");

//On submit:
form.addEventListener("submit", (e) => {
    e.preventDefault();

    //Get the session ID from the form
    var session = document.getElementById("session").value;

    //Trick to empty browser cache, just submit an empty session ID
    if (session == "") {
        alert("Please enter a session ID");

        //Remove the session variable from local storage (makes it easy to empty browser cache)
        localStorage.removeItem("session");
    }

    //If session contains characters other than numbers or letters (to keep it simple)
    else if (!session.match(/^[a-zA-Z0-9]+$/)) {
        alert("Session ID can only contain numbers and letters without spaces");
    }

    else {
        //Store session ID in browser cache
        localStorage.setItem("session", session);
        //Go to the library page
        window.location.href = "miro-library.html";
    }

    //Technically, nothing is sent to the server here. That happens in the library page script

});