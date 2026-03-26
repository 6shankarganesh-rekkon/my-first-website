export default function handler(req, res) {
    // Get the user's Supabase session token from query param
    var userToken = req.query.token || '';

    // Zoho OAuth authorization URL
    var clientId = process.env.ZOHO_CLIENT_ID;
    var redirectUri = 'https://my-first-website-nine-iota.vercel.app/api/zoho-callback';
    var scope = 'ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.settings.READ';

    // We pass the user token in the "state" parameter
    // Zoho will send it back to us in the callback
    // This is how we know WHICH user is connecting
    var authUrl = 'https://accounts.zoho.in/oauth/v2/auth'
        + '?response_type=code'
        + '&client_id=' + clientId
        + '&scope=' + scope
        + '&redirect_uri=' + encodeURIComponent(redirectUri)
        + '&state=' + encodeURIComponent(userToken)
        + '&access_type=offline'
        + '&prompt=consent';

    res.redirect(authUrl);
}
