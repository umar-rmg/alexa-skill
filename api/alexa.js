const Alexa = require('ask-sdk-core');
const { getUserByAlexaAccessToken, storeItems } = require('../services/db');

const DEFAULT_WEBHOOK_URL = 'https://algo1-webhook.vercel.app';
const WEBHOOK_BASE_URL = (
    process.env.ALGO1_WEBHOOK_URL
    || process.env.VITE_ALGO1_WEBHOOK_URL
    || DEFAULT_WEBHOOK_URL
).replace(/\/$/, '');

const getAlexaAccessToken = (handlerInput) => {
    return handlerInput.requestEnvelope.context?.System?.user?.accessToken
        || handlerInput.requestEnvelope.session?.user?.accessToken;
};

const logAlexaLinkState = (handlerInput, accessToken, user) => {
    const systemUser = handlerInput.requestEnvelope.context?.System?.user;
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    const intentName = requestType === 'IntentRequest'
        ? Alexa.getIntentName(handlerInput.requestEnvelope)
        : undefined;
    console.log('Alexa account link state:', {
        hasAccessToken: Boolean(accessToken),
        resolvedUser: Boolean(user),
        applicationId: handlerInput.requestEnvelope.context?.System?.application?.applicationId,
        alexaUserId: systemUser?.userId,
        requestType,
        intentName,
    });
};

const normalizeNotificationItems = (items) => {
    if (!Array.isArray(items)) return [];

    return items
        .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item.name === 'string') return item.name;
            return '';
        })
        .map((name) => name.trim())
        .filter(Boolean);
};

const sendItemsAddedNotification = async (user, items) => {
    const itemNames = normalizeNotificationItems(items);
    if (!user?.id || itemNames.length === 0) return;

    try {
        const response = await fetch(`${WEBHOOK_BASE_URL}/notifications/items-added`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: user.id,
                source: 'alexa',
                items: itemNames,
            }),
        });

        if (!response.ok) {
            console.warn('[alexa] items-added notification failed', { status: response.status });
        }
    } catch (error) {
        console.warn('[alexa] items-added notification request failed', error);
    }
};

const AddItemIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'Add_item_intent';
    },
    async handle(handlerInput) {
        const accessToken = getAlexaAccessToken(handlerInput);
        const user = await getUserByAlexaAccessToken(accessToken);
        logAlexaLinkState(handlerInput, accessToken, user);

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
        const storedItems = await storeItems(items, user.id);
        const notificationItems = Array.isArray(storedItems) && storedItems.length > 0 ? storedItems : items;
        await sendItemsAddedNotification(user, notificationItems);

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
        const accessToken = getAlexaAccessToken(handlerInput);
        const user = await getUserByAlexaAccessToken(accessToken);
        logAlexaLinkState(handlerInput, accessToken, user);

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

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak("You can say, add bananas, or add milk and eggs.")
            .reprompt("What would you like to add to your Algo One list?")
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && ['AMAZON.CancelIntent', 'AMAZON.StopIntent', 'AMAZON.NavigateHomeIntent'].includes(Alexa.getIntentName(handlerInput.requestEnvelope));
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('Goodbye.')
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak("I didn't catch that. You can say, add bananas.")
            .reprompt('What should I add to your list?')
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder.getResponse();
    }
};

const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        console.log('Unhandled Alexa intent:', Alexa.getIntentName(handlerInput.requestEnvelope));
        return handlerInput.responseBuilder
            .speak("I can add groceries to your Algo One list. Try saying, add bananas.")
            .reprompt('What should I add?')
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
            AddItemIntentHandler,
            HelpIntentHandler,
            CancelAndStopIntentHandler,
            FallbackIntentHandler,
            SessionEndedRequestHandler,
            IntentReflectorHandler
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