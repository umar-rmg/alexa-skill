const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CATEGORIES = [
    { id: 'produce',   name: 'Produce' },
    { id: 'snacks',    name: 'Snacks' },
    { id: 'dairy',     name: 'Dairy' },
    { id: 'bakery',    name: 'Bakery' },
    { id: 'beverages', name: 'Beverages' },
    { id: 'frozen',    name: 'Frozen' },
];

const categoryList = CATEGORIES.map(c => `  "${c.id}": "${c.name}"`).join('\n');

/**
 * Assigns categories to a list of item names using OpenAI.
 * @param {string[]} itemNames - Raw item names from Alexa slots.
 * @returns {Promise<Array<{name: string, category: string}>>}
 */
const categorizeItems = async (itemNames) => {
    const message = itemNames.join(', ');

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
            {
                role: 'system',
                content: `You are a grocery list assistant. Assign each item to the best matching category.

Available categories (id: name):
${categoryList}

Respond with a JSON object: { "items": [{"name": "Item Name", "category": "category_id"}] }
Rules:
- Capitalize each item name properly.
- If an item does not clearly fit any category, use "produce" as default.
- Do not include duplicates.`,
            },
            { role: 'user', content: message },
        ],
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return parsed.items ?? [];
};

module.exports = { categorizeItems };
