const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { categorizeItems } = require('./categorize');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const hashSecret = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * Resolves an Alexa OAuth access token to the linked app user.
 * @param {string | undefined} accessToken - Access token from context.System.user.accessToken.
 * @returns {Promise<object | null>} User row or null when unlinked/invalid.
 */
const getUserByAlexaAccessToken = async (accessToken) => {
    if (!accessToken) {
        console.log('Alexa token lookup skipped: no access token in request.');
        return null;
    }

    const tokenHash = hashSecret(accessToken);

    const { data: token, error: tokenError } = await supabase
        .from('alexa_oauth_tokens')
        .select('user_id, token_type, expires_at, revoked_at')
        .eq('token_hash', tokenHash)
        .eq('token_type', 'access')
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (tokenError) {
        console.error('Alexa token lookup failed:', tokenError.message);
        return null;
    }

    if (!token) {
        console.log('Alexa token lookup found no valid token row:', tokenHash.slice(0, 10));
        return null;
    }

    const { data: user, error: userError } = await supabase
        .from('app_users')
        .select('id, public_id, display_name, phone_number')
        .eq('id', token.user_id)
        .maybeSingle();

    if (userError) {
        console.error('Alexa linked user lookup failed:', userError.message);
        return null;
    }

    if (!user) {
        console.log('Alexa token row has no matching app user:', token.user_id);
        return null;
    }

    return user;
};

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
    const categorized = await categorizeItems(itemNames);

    const rows = categorized.map((item) => ({
        user_id: userId,
        name: item.name,
        category: item.category,
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

module.exports = { getOrCreateUser, getUserByAlexaAccessToken, storeItems };
