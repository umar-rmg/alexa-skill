const Alexa = require('ask-sdk-core');
const twilio = require('twilio');

// Environment Variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const receipentNumber = process.env.RECEIPENT_NUMBER;
const client = new twilio(accountSid, authToken);

/**
 * Sends a WhatsApp notification matching the technical specification format.
 */
const sendWhatsAppNotification = async (itemsString) => {
    try {
        // Format from Spec: "{item} has been added to your AlgoOne shopping list..."
        const messageBody = `You added ${itemsString} to your shopping list via Alexa.`;

        await client.messages.create({
            from: 'whatsapp:+14155238886', // Your Twilio Sandbox Number
            to: `whatsapp:${receipentNumber}`,
            body: messageBody
        });
        console.log("WhatsApp message sent successfully.");
    } catch (error) {
        console.error("Twilio Error:", error.message);
    }
};

const AddItemIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'Add_item_intent';
    },
    async handle(handlerInput) {
        const itemSlot = handlerInput.requestEnvelope.request.intent.slots.item;
        let items = [];

        // 1. Handle Multi-Value Slot logic
        if (itemSlot.slotValue && itemSlot.slotValue.type === 'List') {
            items = itemSlot.slotValue.values.map(v => v.value);
        } else if (itemSlot.value) {
            items = [itemSlot.value];
        }

        if (items.length === 0) {
            return handlerInput.responseBuilder
                .speak("I didn't catch the items. What should I add to the list?")
                .reprompt("What items would you like to add?")
                .getResponse();
        }

        // 2. Format for Alexa's voice and WhatsApp
        const itemsString = items.join(', ').replace(/, ([^,]*)$/, ' and $1');

        // 3. Trigger Business Logic: Database and WhatsApp [cite: 122, 124]
        // TODO: await db.insertItems(items);
        await sendWhatsAppNotification(itemsString);

        const speakOutput = `Got it. I've added ${itemsString} to your Algo One list.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak("Welcome to Algo One. What should I add to your shopping list?")
            .reprompt("You can say 'add milk' or 'add eggs and bread'.")
            .getResponse();
    }
};

const ErrorHandler = {
    canHandle() { return true; },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        return handlerInput.responseBuilder
            .speak("Sorry, I had trouble doing that. Please try again.")
            .getResponse();
    }
};

// Vercel Serverless Entry Point
module.exports = async (req, res) => {
    // Safety check for empty requests
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).send('Request body is empty.');
    }

    const skill = Alexa.SkillBuilders.custom()
        .addRequestHandlers(
            LaunchRequestHandler,
            AddItemIntentHandler
        )
        .addErrorHandlers(ErrorHandler)
        .create();

    try {
        const response = await skill.invoke(req.body);
        res.status(200).json(response);
    } catch (error) {
        console.error("Skill Execution Error:", error);
        res.status(500).json({ error: error.message });
    }
};