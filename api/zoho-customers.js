export default async function handler(req, res) {
    // Set CORS headers so frontend can call this
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Get the user's Supabase token from Authorization header
        var authHeader = req.headers.authorization || '';
        var userToken = authHeader.replace('Bearer ', '');

        if (!userToken) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }

        var supabaseUrl = process.env.SUPABASE_URL;
        var serviceKey = process.env.SUPABASE_SERVICE_KEY;

        // Step 1: Identify the user
        var userResp = await fetch(supabaseUrl + '/auth/v1/user', {
            headers: { 'Authorization': 'Bearer ' + userToken, 'apikey': serviceKey }
        });

        var userData = await userResp.json();

        if (!userData.id) {
            return res.status(401).json({ error: 'Invalid user session' });
        }

        // Step 2: Get user's Zoho tokens from database
        var tokensResp = await fetch(
            supabaseUrl + '/rest/v1/ZohoTokens?user_id=eq.' + userData.id + '&select=*',
            {
                headers: {
                    'apikey': serviceKey,
                    'Authorization': 'Bearer ' + serviceKey
                }
            }
        );

        var tokens = await tokensResp.json();

        if (!tokens || tokens.length === 0) {
            return res.status(400).json({ error: 'Zoho not connected. Please connect your Zoho Books account first.' });
        }

        var zohoToken = tokens[0];

        // Step 3: Check if access token is expired, refresh if needed
        var now = new Date();
        var expiry = new Date(zohoToken.token_expiry);

        if (now >= expiry) {
            // Token expired — refresh it
            var clientId = process.env.ZOHO_CLIENT_ID;
            var clientSecret = process.env.ZOHO_CLIENT_SECRET;

            var refreshResp = await fetch('https://accounts.zoho.in/oauth/v2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'grant_type=refresh_token'
                    + '&client_id=' + clientId
                    + '&client_secret=' + clientSecret
                    + '&refresh_token=' + zohoToken.refresh_token
            });

            var refreshData = await refreshResp.json();
            console.log('Token refreshed:', refreshData.access_token ? 'yes' : 'no');

            if (!refreshData.access_token) {
                return res.status(500).json({ error: 'Failed to refresh Zoho token. Please reconnect.' });
            }

            // Update the token in database
            var newExpiry = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();

            await fetch(
                supabaseUrl + '/rest/v1/ZohoTokens?user_id=eq.' + userData.id,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': serviceKey,
                        'Authorization': 'Bearer ' + serviceKey
                    },
                    body: JSON.stringify({
                        access_token: refreshData.access_token,
                        token_expiry: newExpiry
                    })
                }
            );

            zohoToken.access_token = refreshData.access_token;
        }

        // Step 4: Fetch customers from Zoho Books
        var zohoUrl = 'https://www.zohoapis.in/books/v3/contacts?organization_id='
            + zohoToken.organization_id
            + '&contact_type=customer';

        var customersResp = await fetch(zohoUrl, {
            headers: { 'Authorization': 'Zoho-oauthtoken ' + zohoToken.access_token }
        });

        var customersData = await customersResp.json();

        if (customersData.code !== 0) {
            return res.status(500).json({ error: 'Zoho API error: ' + (customersData.message || 'Unknown error') });
        }

        // Step 5: Return customers to frontend
        res.status(200).json({
            success: true,
            customers: customersData.contacts || [],
            organization_id: zohoToken.organization_id
        });

    } catch (err) {
        console.error('Zoho customers error:', err);
        res.status(500).json({ error: err.message });
    }
}
