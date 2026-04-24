const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

/**
 * Looks up a user by phone number. Creates the user if not found.
 * @param {string} phoneNumber - E.164 formatted phone number (e.g. +923150576007).
 * @returns {Promise<object>} User row with at minimum { id }.
 */
const getOrCreateUser = async (phoneNumber) => {
    // Normalize to match how Twilio/webhook stores numbers in the DB
    const normalizedPhone = phoneNumber.startsWith('whatsapp:')
        ? phoneNumber
        : `whatsapp:${phoneNumber}`;

    const { data: existing, error: lookupError } = await supabase
        .from('app_users')
        .select('id, public_id, display_name')
        .eq('phone_number', normalizedPhone)
        .limit(1)
        .single();

    if (lookupError && lookupError.code !== 'PGRST116') {
        // PGRST116 = "no rows found" — any other error is unexpected
        throw new Error(`User lookup failed: ${lookupError.message}`);
    }

    if (existing) return existing;

    const { data: created, error: insertError } = await supabase
        .from('app_users')
        .insert({ phone_number: normalizedPhone })
        .select('id, public_id, display_name')
        .single();

    if (insertError) throw new Error(`User creation failed: ${insertError.message}`);
    return created;
};

/**
 * Inserts shopping items for a given user into the database.
 * @param {string[]} itemNames - Array of item name strings from Alexa.
 * @param {string} userId - The UUID of the user to associate items with.
 * @returns {Promise<object[]>} The inserted rows.
 */
const storeItems = async (itemNames, userId) => {
    const rows = itemNames.map((name) => ({
        user_id: userId,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        source: 'alexa',
    }));

    const { data, error } = await supabase
        .from('shopping_list_items')
        .insert(rows)
        .select();

    if (error) {
        throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return data;
};

module.exports = { getOrCreateUser, storeItems };
