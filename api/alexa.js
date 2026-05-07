const Alexa = require('ask-sdk-core');
const twilio = require('twilio');
const { getUserByAlexaAccessToken, storeItems } = require('../services/db');

// Environment Variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = accountSid && authToken ? new twilio(accountSid, authToken) : null;

const LIST_APP_URL = process.env.LIST_APP_URL;

/**
 * Sends a WhatsApp confirmation matching the algo1-webhook format.
 */
const sendWhatsAppNotification = async (user, itemNamesString) => {
    if (!client || !user.phone_number) return;

    try {
        const listUrl = `${LIST_APP_URL}?u=${user.public_id}`;
        const greeting = user.display_name ? `Hi ${user.display_name}! ` : 'Hi! ';
        const messageBody = `${greeting}Added ${itemNamesString} to your list! 🛒\n\n${listUrl}`;
        const toNumber = user.phone_number.startsWith('whatsapp:')
            ? user.phone_number
            : `whatsapp:${user.phone_number}`;

        await client.messages.create({
            from: 'whatsapp:+17177449812',
            to: toNumber,
            body: messageBody
        });
        console.log('WhatsApp message sent successfully.');
    } catch (error) {
        console.error('Twilio Error:', error.message);
    }
};

const AddItemIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'Add_item_intent';
    },
    async handle(handlerInput) {
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        const user = await getUserByAlexaAccessToken(accessToken);

        if (!user) {
            return handlerInput.responseBuilder
                .speak('To add items to your Algo One list, please open the Alexa app and link your Algo One account.')
                .withLinkAccountCard()
                .getResponse();
        }

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

        console.log(`Items being added (count: ${items.length}):`, items);

        // 2. Format for Alexa's voice and WhatsApp
        const itemsString = items.join(', ').replace(/, ([^,]*)$/, ' and $1');

        // 3. Trigger Business Logic: Database and WhatsApp
        await storeItems(items, user.id);
        await sendWhatsAppNotification(user, itemsString);

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
    async handle(handlerInput) {
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        const user = await getUserByAlexaAccessToken(accessToken);

        if (!user) {
            return handlerInput.responseBuilder
                .speak('Welcome to Algo One. To add items to your list, please open the Alexa app and link your Algo One account.')
                .withLinkAccountCard()
                .getResponse();
        }

        const greeting = user.display_name ? `Welcome back, ${user.display_name}.` : 'Welcome back.';
        return handlerInput.responseBuilder
            .speak(`${greeting} What should I add to your shopping list?`)
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