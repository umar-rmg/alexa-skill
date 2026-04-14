const Alexa = require('ask-sdk-core');
const twilio = require('twilio');

// Twilio setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new twilio(accountSid, authToken);

const sendWhatsApp = async (item) => {
    try {
        await client.messages.create({
            from: 'whatsapp:+14155238886', // Twilio Sandbox Number
            to: 'whatsapp:+16464369745', // Your verified phone number
            body: `You added "${item}" to your shopping list via Alexa.`
        });
        console.log("WhatsApp message sent.");
    } catch (error) {
        console.error("Twilio Error:", error.message);
    }
};

// Alexa Intent Handler
const AddingItemIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'Add_item_intent';
    },
    async handle(handlerInput) {
        const itemName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'item');

        // Trigger the WhatsApp message
        await sendWhatsApp(itemName);

        return handlerInput.responseBuilder
            .speak(`Got it. I've added ${itemName} to your list and sent a WhatsApp confirmation.`)
            .getResponse();
    }
};

// Generic Launch Request Handler
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak("Welcome to Algo One. What should I add to your list?")
            .reprompt("I didn't catch that. What would you like to add?")
            .getResponse();
    }
};

// Vercel Serverless Function Wrapper
module.exports = async (req, res) => {
    // 1. Log the request method and body for debugging
    console.log(`Received ${req.method} request`);
    console.log("Body:", JSON.stringify(req.body));

    // 2. Guard against non-POST or empty requests
    if (req.method !== 'POST' || !req.body || Object.keys(req.body).length === 0) {
        return res.status(400).send('This endpoint requires a POST request with an Alexa RequestEnvelope.');
    }

    const skill = Alexa.SkillBuilders.custom()
        .addRequestHandlers(
            LaunchRequestHandler,
            AddingItemIntentHandler
        )
        .create();

    try {
        const response = await skill.invoke(req.body);
        res.status(200).json(response);
    } catch (error) {
        console.error("Skill Error:", error);
        res.status(500).json({ error: error.message });
    }
};