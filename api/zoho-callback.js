export default async function handler(req, res) {
    try {
        var code = req.query.code;
        var state = req.query.state; // This is the user's Supabase token
        var error = req.query.error;

        if (error) {
            return res.redirect('/?zoho_error=' + encodeURIComponent(error));
        }

        if (!code || !state) {
            return res.redirect('/?zoho_error=missing_params');
        }

        // Step 1: Exchange authorization code for access + refresh tokens
        var clientId = process.env.ZOHO_CLIENT_ID;
        var clientSecret = process.env.ZOHO_CLIENT_SECRET;
        var redirectUri = 'https://my-first-website-nine-iota.vercel.app/api/zoho-callback';

        var tokenUrl = 'https://accounts.zoho.in/oauth/v2/token';
        var tokenBody = 'grant_type=authorization_code'
            + '&client_id=' + clientId
            + '&client_secret=' + clientSecret
            + '&redirect_uri=' + encodeURIComponent(redirectUri)
            + '&code=' + code;

        var tokenResp = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody
        });

        var tokenData = await tokenResp.json();
        console.log('Zoho token response:', tokenData);

        if (!tokenData.access_token) {
            return res.redirect('/?zoho_error=' + encodeURIComponent(tokenData.error || 'token_exchange_failed'));
        }

        // Step 2: Get the user's Zoho organization ID
        var orgsResp = await fetch('https://www.zohoapis.in/books/v3/organizations', {
            headers: { 'Authorization': 'Zoho-oauthtoken ' + tokenData.access_token }
        });

        var orgsData = await orgsResp.json();
        console.log('Zoho orgs:', orgsData);

        var orgId = '';
        if (orgsData.organizations && orgsData.organizations.length > 0) {
            orgId = orgsData.organizations[0].organization_id;
        }

        // Step 3: Identify which user this is using their Supabase token
        var supabaseUrl = process.env.SUPABASE_URL;
        var serviceKey = process.env.SUPABASE_SERVICE_KEY;

        // Verify the user's token with Supabase
        var userResp = await fetch(supabaseUrl + '/auth/v1/user', {
            headers: { 'Authorization': 'Bearer ' + state, 'apikey': serviceKey }
        });

        var userData = await userResp.json();
        console.log('User data:', userData.id);

        if (!userData.id) {
            return res.redirect('/?zoho_error=invalid_user_session');
        }

        // Step 4: Save tokens to Supabase using service role key (bypasses RLS)
        var expiry = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

        var upsertResp = await fetch(supabaseUrl + '/rest/v1/ZohoTokens', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': 'Bearer ' + serviceKey,
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
                user_id: userData.id,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                organization_id: orgId,
                token_expiry: expiry,
                connected_at: new Date().toISOString()
            })
        });

        console.log('Upsert status:', upsertResp.status);

        // Step 5: Redirect user back to app with success
        res.redirect('/?zoho_connected=true');

    } catch (err) {
        console.error('Callback error:', err);
        res.redirect('/?zoho_error=' + encodeURIComponent(err.message));
    }
}
