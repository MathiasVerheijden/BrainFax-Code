// Library for local file system
const fs = require('fs');

// Create array to store sessions and board IDs
var sessions = [];

// Create arrays to store the generated images and their prompts
var images = [];
var prompts = [];

// Retrieves backup file and updates arrays, if the file exists
if (fs.existsSync('backup/backup.json')) {
    fs.readFile('backup/backup.json', (err, data) => {
        if (err) throw err;
        const jsonObject = JSON.parse(data);
        images = jsonObject.images;
        prompts = jsonObject.prompts;
        console.log("Backup file loaded");
        console.log(images);
        console.log(prompts);
    });
}

// Spawn points for images in Miro board
var spawnPoints = [[0, 0], [740, 0], [0, 740], [740, 740]];
var spawnCount = 0; //Keeps track of where to spawn next image

// Import Miro API and set the token
const sdk = require('api')('@miro-ea/v2.0#18f2md65l9fmcysj');
sdk.auth('AUTH_TOKEN_HERE');
const framesdk = require('api')('@miro-ea/v2.0#55tztgl8d2kwnj'); //Experimental version required for creating Miro frames (02-11-2022)
framesdk.auth('AUTH_TOKEN_HERE');

// Load all existing boards in the team
updateBoards();




// Create a socket on port 3100
const io = require('socket.io')(3100, {
    cors: {
        origin: "*", //Allow all origins (for development purposes only)
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE"
    }
});

// Let library page know a connection was made, which will then request to join a session, which is also handled below
io.on("connection", socket => {
    console.log("New socket with ID '" + socket.id + "' connected");
    io.to(socket.id).emit("enter", "entered");

    socket.on("join", session => {
        socket.join(session);
        io.to(session).emit("lib-update", images); //Send the images array to the client (for when the page refreshes)
        checkBoards(session); //Checks if Miro board already exists and creates a new one
    });
});




// Import express for HTTP requests and create app to use express
const express = require('express');
const app = express();

// The json body parser is not standard in express v4, so we need to add it manually
const bp = require('body-parser');
const { response } = require('express');
app.use(bp.json())
app.use(bp.urlencoded({ extended: true }))




// Handler for post request on /api/save, made by Telegram Client
app.post('/api/save', (req, res) => {
    // Get urls and prompts from request
    let newUrl = req.body.image;
    let newPrompt = req.body.prompt;

    // Show new data that is added
    console.log(newUrl);
    console.log(newPrompt);

    // Don't forget to send a response, otherwise the request will timeout
    res.sendStatus(200);

    // Update existing arrays with new data
    images = images.concat(newUrl);
    prompts = prompts.concat(newPrompt);

    // Saves the images and prompts arrays to a local backup file
    let backupJSON = {
        images: images,
        prompts: prompts
    }
    let backupString = JSON.stringify(backupJSON);
    fs.writeFile('backup/backup.json', backupString, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
      });

    //Makes it easy to find new data in console
    console.log("NEW ARRAYS ---------------------------------");
    console.log(images);
    console.log(prompts);

    //Send new image to Miro board (uses latest board that was created, multi session support not yet implemented)
    saveImageToBoard(newPrompt[0], newUrl[0], sessions[0][1]);
});

// Handler for get request on /api/get, made by Telegram Client
app.get('/api/get', async (req, res) => {
    let reqid = req.body.id;
    
    // Sends back corresponding url and prompt to the Telegram Client
    // This data is based on the arrays in this server, it does not pull data from Miro, because Miro does not store the original image URL
    res.send({ image: images[reqid], prompt: prompts[reqid] });
});




// Checks if a Miro board with session name already exists when user tries to join
async function checkBoards(session) {
    sdk.getBoards({ team_id: '3458764537425214730', sort: 'default' })
        .then(res => {
            boards = res.data.data // First 'data' points to the JSON response, the second 'data' points to the array of boards
            for (const board of boards) {
                if (board.name == session) {
                    console.log("Miro board called '" + session + "' already exists, joining this board");
                    io.to(session).emit("join-board", board.id); // Send the board ID to the client, which opens Miro iframe with this board
                    return;
                }
            }
            // If board does not exist, this creates a new one
            createBoard(session);
        })
        .catch(err => console.error(err));
}




//Function that creates new Miro board based on session name, and creates frame in which images are placed
async function createBoard(session) {
    console.log("Creating new Miro board called \"" + session + "\" and joining this board");
    const board = await sdk.createBoard({
        name: session,
        policy: {
            permissionsPolicy: {
                collaborationToolsStartAccess: 'all_editors',
                copyAccess: 'anyone',
                sharingAccess: 'team_members_with_editing_rights'
            },
            sharingPolicy: {
                access: 'private',
                inviteToAccountAndBoardLinkAccess: 'no_access',
                organizationAccess: 'private',
                teamAccess: 'private'
            }
        }
    }).then(res => {
        sessions.push([session, res.data.id]);
        console.log("Sessions: " + sessions);
        io.to(session).emit("join-board", res.data.id); // Send the board ID to the client, which opens Miro iframe with this board

        sdk.createShapeItem({
            data: {
                content: 'New images',
                shape: 'rectangle'
            },
            style: {
                borderColor: '#000000',
                borderStyle: 'dashed',
                fillColor: '#ffffff',
                fontSize: '64',
                textAlign: 'center',
                textAlignVertical: 'middle'
            },
            position: { origin: 'center', x: 0, y: 0 },
            geometry: { height: 1500, width: 1500 }
        }, { board_id: res.data.id })
            .then(res => console.log(res))
            .catch(err => console.error(err));

    }).catch(err => console.error(err));
}




// Function that saves a new image to the corresponding board
// Creates a frame first, then adds the image to the frame, then adds a caption to the frame
// Frames are used here because the Miro API does not allow grouping, therefore the Frame keeps everything together.
async function saveImageToBoard(imagePrompt, imageUrl, boardID) {   
    var imageSize = 512;
    var frameSize = imageSize + 40;
    
    // Images spawn at 4 points in the frame, preventing one big pile (-370 because the frame origin is in the middle)
    if (spawnCount > 3) {
        spawnCount = 0;
        xPos = spawnPoints[spawnCount][0] - 370;
        yPos = spawnPoints[spawnCount][1] - 370;
        spawnCount++;
    } else {
        xPos = spawnPoints[spawnCount][0] - 370;
        yPos = spawnPoints[spawnCount][1] - 370;
        spawnCount++;
    }

    // Would be better to generate random ID's here. Because a backup file is loaded when te server starts, no double
    // IDs will be generated during the next session
    var id = (images.length - 1).toString();
    var frame;

    // Creates frame
    await framesdk.createFrameItem({
        data: {
            format: 'custom',
            title: '[' + id + ']: ' + '"' + imagePrompt + '"',
            type: 'freeform'
        },
        style: { fillColor: '#ffffff' },
        position: { origin: 'center', x: xPos, y: yPos },
        geometry: { height: frameSize, width: frameSize }
    }, { board_id: boardID, accept: '*/*' })
        .then(res => {
            frame = res.data.id;
        })
        .catch(err => console.error(err));

    await sdk.createImageItemUsingUrl({
        data: {
            url: imageUrl,
            title: '[' + id + ']: ' + '"' + imagePrompt + '"'
        },
        position: { origin: 'center', x: frameSize / 2, y: frameSize / 2 }, //Position is relative to the frame
        geometry: { height: imageSize }, //Miro only supports one dimension for images with square/fixed aspect ratio
        parent: { id: frame }
    }, { board_id: boardID })
        .then(res => {

            sdk.createTextItem({
                data: { content: '[' + id + ']: ' + '"' + imagePrompt + '"' },
                style: {
                    fontSize: '24',
                    textAlign: 'center',
                    fillColor: '#ffffff'
                },
                position: { origin: 'center', x: frameSize / 2, y: frameSize - 10 }, //Position is relative to the frame
                parent: { id: frame }
            }, { board_id: boardID })
                .then(res => console.log(res))
                .catch(err => console.error(err));
        })
        .catch(err => console.error(err));
}



//Function that pulls all existing boards from Miro and updates the sessions array
//For now, BrainFax uses the last generated Miro Board as the active board
async function updateBoards() {
    await sdk.getBoards({ team_id: '3458764537425214730', sort: 'default' })
        .then(res => {
            boards = res.data.data //First 'data' points to the JSON response, the second 'data' points to the array of boards
            for (const board of boards) {
                sessions.push([board.name, board.id]);
            }
            console.log("Active sessions updated: " + sessions);
        })
        .catch(err => console.error(err));
}

// Handler for HTTP requests on assigned port
app.listen(3000);