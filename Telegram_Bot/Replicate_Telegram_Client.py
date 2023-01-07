#For Stable Diffusion
import replicate
import requests

#For Telegram Bot
import logging
import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import *

# Save replicate API KEY as environment variable (this is where the library gets the API key from)
os.environ["REPLICATE_API_TOKEN"] = "API_KEY_HERE"
# Telegram Bot Token
API_KEY = "API_TOKEN_HERE"

#Log all the events in the console
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

# Whitelist for users that are allowed to perform image generations
# Can be used to prevent spam
userList = ["YOUR_USERNAMES_HERE"]
def checkCredentials(username):
    if username not in userList:
        return False
    return True


# Sends message containing instructions on how to use
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await context.bot.send_message(
        chat_id=update.effective_chat.id,
        parse_mode='Markdown',
        text="""*Welcome to BrainFax!*\nFor Txt2Img, use the command: /imagine \[prompt]. You can save your generated images by pressing the save button under them!\n\nFor Img2Img, send a square image with a prompt in the caption.\n\nTo get an existing image from the baord, use the command: /get \[image id].\n\n*Pro Tip*: To iterate on existing images, get the image from the board using /get, draw over it right inside of Telegram and send it back with a caption explaining what it should be!"""
    )


# Generates images based on given prompt
async def imagine(update: Update, context: ContextTypes.DEFAULT_TYPE):   
    if checkCredentials(update.message.from_user.username) == False:
        return
    
    arguments = context.args

    # Check if no prompt is provided
    if not arguments:
        await context.bot.send_message(
            chat_id=update.effective_chat.id,
            text="Please ensure to include a prompt, like: '/imagine [prompt]'"
        )
        return

    # Join arguments into a string and notify user
    txtIn = " ".join(arguments)
    await context.bot.send_message(
        chat_id=update.effective_chat.id,
        parse_mode='Markdown',
        text="*Running text2image generation using*: \"_" + txtIn + "_\""
    )

    # Generate images, send them back over telegram and send to webserver
    x = 0
    s = 7.5

    # Uses latest version of SD (2.1, 12-12-2022) which creates better results, but does not support img2img
    sd = replicate.models.get("stability-ai/stable-diffusion")
    version = sd.versions.get("6359a0cab3ca6e4d3320c33d79096161208e9024d174b2311e5a21b6c7e1131c") #SD 2.1
    print("Running txt2img...")
    images = version.predict(width=512, height=512, prompt=txtIn, negative_prompt="ugly, bad quality, bad composition, off-center, busy background, cartoon, blurry, oversaturated", num_outputs=4, guidance_scale = s)
    print("Done! Sending to Telegram...")

    # All four images returned are sent as image including URL and prompt
    for url in list(images):
        buttons = [[InlineKeyboardButton("Save", callback_data="save")]]

        await context.bot.send_photo(
            chat_id=update.effective_chat.id,
            photo=url,
            parse_mode='Markdown',
            caption = "Output " + str(x + 1) + " using: \"_" + txtIn + "_\"\n" + "(" + url + ")",
            reply_markup=InlineKeyboardMarkup(buttons)
        )
        x += 1
    print("Done!")


# Generates images based on given prompt and image (img2img)
async def edit(update: Update, context: ContextTypes.DEFAULT_TYPE): 
    if checkCredentials(update.message.from_user.username) == False:
        return

    inImg = await update.message.photo[-1].get_file() #Returns JSON incl file_path
    imgPath = str(inImg['file_path']) #URL used for communicaiton with Replicate

    # Get prompt
    txtIn = update.message.caption
    if txtIn == None:
        await context.bot.send_message(
            chat_id=update.effective_chat.id,
            text="Please enclose your prompt in the caption of the image!"
        )
        return

    # Notify user
    await context.bot.send_message(
        chat_id=update.effective_chat.id,
        parse_mode='Markdown',
        text="*Running image2image generation using*: \"_" + txtIn + "_\""
    )

    # This uses Stable Diffusion 1.5, because 2.1 does not support img2img on Replicate (08-12-2022)
    sd = replicate.models.get("stability-ai/stable-diffusion")
    version = sd.versions.get("27b93a2413e7f36cd83da926f3656280b2931564ff050bf9575f1fdf9bcd7478") #SD 1.5
    print("Running img2img...")
    s = 0.6
    images = version.predict(prompt=txtIn, init_image=imgPath, num_outputs=4, prompt_strength=s)

    # All four images returned are sent as image including URL and prompt 
    for url in images:
        buttons = [[InlineKeyboardButton("Save", callback_data="save")]]
        await context.bot.send_photo(
            chat_id=update.effective_chat.id,
            photo=url,
            parse_mode='Markdown',
            caption = "Generation at " + str(round(s*100, 2)) + "% " + "strength using: \"_" + txtIn + "_\"\n" + "(" + url + ")",
            reply_markup=InlineKeyboardMarkup(buttons)
        )
        s -= 0.1 #Prompt strength is decreased by 10% for each image, giving the model more freedom to edit the image


# Retrieves image from the Miro board based on given ID
async def get(update: Update, context: ContextTypes.DEFAULT_TYPE):   
    if checkCredentials(update.message.from_user.username) == False:
        return

    arguments = context.args

    # Check if arguments is empty
    if not arguments:
        await context.bot.send_message(
            chat_id=update.effective_chat.id,
            text="Please ensure to include an id, like: '/get [id]'"
        )
        return

    # Join arguments into a string    
    id = " ".join(arguments)
    await context.bot.send_message(
        chat_id=update.effective_chat.id,
        parse_mode='Markdown',
        text="Getting image with id: _" + id + "_"
    )

    # Send get request to BrainFax Node server with url localhost:3000/api/save
    os.environ['NO_PROXY'] = 'localhost'
    r = requests.get('http://localhost:3000/api/get', json = {"id": id})

    # Get the response from the request
    response = r.json()

    # Get the image and prompt from the response
    image = response["image"]
    prompt = response["prompt"]

    # Send the image and prompt back to the user
    await context.bot.send_photo(
        chat_id=update.effective_chat.id,
        photo=image,
        parse_mode='Markdown',
        caption = "_" + prompt + "_"
    )

    print("Status code: " + str(r.status_code))


# Updates the key used for the Replicate API
async def key(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if checkCredentials(update.message.from_user.username) == False:
        return

    arguments = context.args    

    # Check if arguments is empty
    if not arguments:
        await context.bot.send_message(
            chat_id=update.effective_chat.id,
            text="Please ensure to include a valid API key, like: '/key [replicate API key]'"
        )
        return

    # Join arguments into a string and notify user 
    key = " ".join(arguments)
    await context.bot.send_message(
        chat_id=update.effective_chat.id,
        text="Applying Replicate API key: " + key
    )

    os.environ["REPLICATE_API_TOKEN"] = key


# Tells Node server to join a room so that images can be sent to specific Miro boards
# (Not implemented yet on server side, images will be sent to latest Miro Board by default)
async def join(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if checkCredentials(update.message.from_user.username) == False:
        return

    user = update.message.from_user.username
    arguments = context.args    

    # Check if arguments is empty
    if not arguments:
        await context.bot.send_message(
            chat_id=update.effective_chat.id,
            text="Please ensure to include a session name!"
        )
        return

    # Join arguments into a string    
    room = " ".join(arguments)
    await context.bot.send_message(
        chat_id=update.effective_chat.id,
        text="Joining room: " + room
    )

    # Prepare user data in JSON format
    userData = {
        "user": user,
        "room": room
    }

    # Send post request with url localhost:3000/api/save
    os.environ['NO_PROXY'] = 'localhost'
    r = requests.post('http://localhost:3000/api/user', json = userData)
    print(r.status_code)


# Handles callback from 'save' buttons under generated images
async def callback(update: Update, context: ContextTypes.DEFAULT_TYPE): 
    query = update.callback_query

    # Get caption from message
    caption = query.message.caption

    # The server expects a list of images and prompts, so we create a list with one item
    images = []
    prompts = []

    # Get the prompt and image url from the caption
    prompts.append(caption.split('"')[1])
    images.append(caption.split("(")[1].split(")")[0])

    # Convert to JSON format
    generations = {
        "image": images,
        "prompt": prompts
    }

    await query.answer()

    # Send post request to BrainFax Node server with new image data, with url localhost:3000/api/save
    os.environ['NO_PROXY'] = 'localhost'
    r = requests.post('http://localhost:3000/api/save', json = generations)
    print(r.status_code)

         
# Handlers for bot commands, these call the functions defined above above    
def main():
    # Create the Updater and pass it your bot's token.
    app = ApplicationBuilder().token(API_KEY).build()

    # These handlers seem to have an automatic queue, where no response is given to a user until the previous response is handled
    app.add_handler(CallbackQueryHandler(callback))
    app.add_handler(CommandHandler("join", join))
    app.add_handler(CommandHandler("get", get))
    app.add_handler(CommandHandler("key", key))
    app.add_handler(MessageHandler(filters.PHOTO, edit))
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("imagine", imagine))
    app.run_polling()

main()