import FormData from "form-data";
import axios from "axios";

const ZOHO_BIGIN_API_URL =
  process.env.ZOHO_BIGIN_API_URL || "https://www.zohoapis.in/bigin/v2";

const ZOHO_CRM_API_URL =
  process.env.ZOHO_CRM_API_URL || "https://www.zohoapis.in/crm/v3";

const ZOHO_ACCOUNTS_URL =
  process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";

export function generateZohoAuthUrl() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;

  if (!clientId) {
    throw new Error("ZOHO_CLIENT_ID environment variable is required");
  }

const scopes = [
  "ZohoBigin.modules.ALL",
  "ZohoBigin.modules.attachments.ALL",
  "ZohoBigin.settings.ALL",
  "ZohoBigin.users.ALL"
].join(",");


  const authUrl = new URL("/oauth/v2/auth", ZOHO_ACCOUNTS_URL);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("redirect_uri", redirectUri);

  console.log("🔗 Generated OAuth URL:", authUrl.toString());
  return authUrl.toString();
}

export async function handleZohoOAuthCallback(authorizationCode, location = "in") {
  try {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const redirectUri = process.env.ZOHO_REDIRECT_URI;

    console.log("🔒 [TOKEN-CREATE] Step 1 - environment values");
    console.log(`  ƒ\"o Client ID present: ${!!clientId}`);
    console.log(`  ƒ\"o Client Secret present: ${!!clientSecret}`);
    console.log(`  ƒ\"o Redirect URI: ${redirectUri}`);

    if (!clientId || !clientSecret) {
      throw new Error("ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET environment variables are required");
    }

    const accountsUrlMap = {
      "in": "https://accounts.zoho.in",
      "eu": "https://accounts.zoho.eu",
      "com.au": "https://accounts.zoho.com.au"
    };
    const accountsUrl = accountsUrlMap[location] || "https://accounts.zoho.com";

    console.log("🔄 Step 2 - exchanging authorization code for tokens...");
    console.log("  ├ Accounts URL:", accountsUrl);
    console.log("  ├ Client ID:", clientId);
    console.log("  ├ Redirect URI:", redirectUri);
    console.log("  └ Auth code:", authorizationCode.substring(0, 20) + "...");
    console.log("  └ Location hint:", location);
    console.log('  └ Token endpoint:', `${accountsUrl}/oauth/v2/token`);
    console.log('  └ Request params:', {
      grant_type: "authorization_code",
      code: authorizationCode ? "present" : "missing",
      redirect_uri: redirectUri
    });

    const response = await axios.post(
      `${accountsUrl}/oauth/v2/token`,
      null,
      {
        params: {
          code: authorizationCode,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    console.log("🔁 Step 3 - token response received");
    console.log("  ├ Response status:", response.status);
    console.log("  ├ Access token length check:", access_token ? access_token.length : 'missing');
    console.log("  ├ Refresh token length check:", refresh_token ? refresh_token.length : 'missing');

    if (!access_token || !refresh_token) {
      console.error("❌ Invalid token response:", response.data);
      throw new Error("Failed to obtain valid tokens from Zoho");
    }

    console.log("✅ Tokens obtained successfully!");
    console.log("  ├ Access token length:", access_token.length);
    console.log("  ├ Refresh token length:", refresh_token.length);
    console.log("  └ Expires in:", expires_in, "seconds");

    console.log("\n" + "=".repeat(80));
    console.log("📋 COPY THESE TOKENS TO YOUR .ENV FILE:");
    console.log("=".repeat(80));
    console.log(`ZOHO_ACCESS_TOKEN=${access_token}`);
    console.log(`ZOHO_REFRESH_TOKEN=${refresh_token}`);
    console.log(`ZOHO_ACCOUNTS_BASE=${accountsUrl}`);
    console.log("=".repeat(80));
    console.log("💡 Add these to your .env file for automatic token refresh!");
    console.log("=".repeat(80) + "\n");
    process.env.ZOHO_ACCESS_TOKEN = access_token;
    process.env.ZOHO_REFRESH_TOKEN = refresh_token;
    process.env.ZOHO_ACCOUNTS_BASE = accountsUrl;

    console.log("✅ OAuth tokens obtained successfully!");
    console.log("⚠️  IMPORTANT: Copy the refresh token above to your .env file manually");
    console.log("⚠️  Do NOT restart the server until you've updated .env with the new tokens");

    return {
      success: true,
      access_token,
      refresh_token,
      expires_in,
      accounts_url: accountsUrl
    };

  } catch (error) {
    console.error("❌ OAuth token exchange failed:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error_description || error.message
    };
  }
}

export async function testZohoAccess() {
  try {
    const accessToken = await getZohoAccessToken();
    const baseUrl = process.env.ZOHO_BIGIN_API_URL || "https://www.zohoapis.in/bigin/v2";

    console.log("🧪 Testing Zoho access with user info...");

    const testEndpoints = [
      `${baseUrl}/users/me`,
      `${baseUrl}/users`,
      `${baseUrl}/org`,
      `${baseUrl}/settings/modules`
    ];

    for (const endpoint of testEndpoints) {
      try {
        console.log(`🧪 Testing: ${endpoint}`);
        const response = await axios.get(endpoint, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });
        console.log(`✅ Access granted to: ${endpoint}`, response.status);
      } catch (testError) {
        console.log(`❌ Access denied to: ${endpoint}`, testError.response?.status, testError.response?.data?.code);
      }
    }

  } catch (error) {
    console.error("❌ Token test failed:", error.message);
  }
}

async function detectZohoBiginBaseUrl() {
  try {
    const accessToken = await getZohoAccessToken();

    console.log("🔍 [AUTO-DETECT] Testing Zoho endpoints to find the correct data center...");

    const accountsUrl = process.env.ZOHO_ACCOUNTS_BASE || ZOHO_ACCOUNTS_URL;
    let primaryDataCenter = 'com';

    if (accountsUrl.includes('.in')) {
      primaryDataCenter = 'in';
    } else if (accountsUrl.includes('.eu')) {
      primaryDataCenter = 'eu';
    } else if (accountsUrl.includes('.com.au')) {
      primaryDataCenter = 'com.au';
    }

    console.log(`🔍 [AUTO-DETECT] Detected data center: ${primaryDataCenter} (from accounts URL: ${accountsUrl})`);

    const dataCenters = [primaryDataCenter, 'com', 'in', 'eu', 'com.au'].filter((dc, index, arr) => arr.indexOf(dc) === index);

    const testEndpoints = [];

    for (const dc of dataCenters) {
      const domain = dc === 'com.au' ? 'zohoapis.com.au' : `zohoapis.${dc}`;
      testEndpoints.push(`https://www.${domain}/bigin/v1/Deals`);
    }

    for (const dc of dataCenters) {
      const domain = dc === 'com.au' ? 'zohoapis.com.au' : `zohoapis.${dc}`;
      testEndpoints.push(`https://www.${domain}/bigin/v2/Deals`);
    }

    console.log(`🔍 [AUTO-DETECT] Testing ${testEndpoints.length} endpoints, prioritizing ${primaryDataCenter} data center...`);

    for (const endpoint of testEndpoints) {
      try {
        const response = await axios.get(endpoint, {
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            'Accept': 'application/json'
          },
          timeout: 5000
        });

        if (response.status === 200 && response.data) {
          const baseUrl = endpoint.replace('/Deals', '');
          console.log(`✅ [AUTO-DETECT] Found working endpoint: ${baseUrl}`);
          console.log(`📊 [AUTO-DETECT] Deals info:`, response.data?.data?.length || 'Retrieved successfully');

          process.env.ZOHO_BIGIN_DETECTED_BASE = baseUrl;
          return baseUrl;
        }
      } catch (error) {
        console.log(`⚠️ [AUTO-DETECT] ${endpoint}: ${error.response?.status || error.code}`);
      }
    }

    console.log("❌ [AUTO-DETECT] No working Zoho Bigin endpoint found");
    return null;
  } catch (error) {
    console.error("❌ [AUTO-DETECT] Failed to detect Zoho base URL:", error.message);
    return null;
  }
}

export async function getZohoDeals() {
  try {
    const accessToken = await getZohoAccessToken();

    console.log("📋 Fetching deals from Zoho Bigin...");

    let baseUrlToTry = process.env.ZOHO_BIGIN_DETECTED_BASE || process.env.ZOHO_BIGIN_WORKING_URL;

    if (!baseUrlToTry) {
      console.log("🔍 No cached endpoint, running auto-detection...");
      baseUrlToTry = await detectZohoBiginBaseUrl();
    }

    if (baseUrlToTry) {
      console.log(`🎯 Testing detected endpoint: ${baseUrlToTry}`);

      const dealEndpoints = ["deals", "Deals", "Potentials", "potentials"];

      for (const dealEndpoint of dealEndpoints) {
        const fullUrl = `${baseUrlToTry}/${dealEndpoint}`;

        try {
          console.log(`🔍 Testing deals endpoint: ${fullUrl}`);
          const response = await axios.get(fullUrl, {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Accept': 'application/json'
            },
            timeout: 5000
          });

          const contentType = response.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            const deals = response.data?.data || [];
            console.log(`✅ SUCCESS with detected endpoint: ${fullUrl}`);
            console.log(`📋 Found ${deals.length} deals`);

            process.env.ZOHO_BIGIN_WORKING_URL = baseUrlToTry;
            process.env.ZOHO_BIGIN_DEALS_ENDPOINT = dealEndpoint;

            return deals;
          }
        } catch (error) {
          console.log(`❌ Detected endpoint failed ${fullUrl}: ${error.response?.status || error.code}`);
        }
      }
    }

    const possibleBaseUrls = [
      "https://www.zohoapis.com/bigin/v1",
      "https://www.zohoapis.in/bigin/v1",
      "https://www.zohoapis.eu/bigin/v1",
      "https://www.zohoapis.com.au/bigin/v1",
      "https://www.zohoapis.com/bigin/v2",
      "https://www.zohoapis.in/bigin/v2",
      "https://www.zohoapis.eu/bigin/v2",
      "https://www.zohoapis.com.au/bigin/v2",
      "https://bigin.zoho.com/crm/v2",
      "https://bigin.zoho.in/crm/v2",
      "https://bigin.zoho.eu/crm/v2",
      "https://bigin.zoho.com.au/crm/v2"
    ];

    const dealEndpoints = [
      "deals",
      "Deals",
      "Potentials",
      "potentials"
    ];

    for (const baseUrl of possibleBaseUrls) {
      console.log(`🌍 Trying base URL: ${baseUrl}`);

      for (const dealEndpoint of dealEndpoints) {
        const fullUrl = `${baseUrl}/${dealEndpoint}`;

        try {
          console.log(`🔍 Testing API endpoint: ${fullUrl}`);
          const response = await axios.get(fullUrl, {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              'Accept': 'application/json'
            },
            timeout: 5000
          });

          const contentType = response.headers['content-type'] || '';
          if (!contentType.includes('application/json')) {
            console.log(`❌ Non-JSON response from ${fullUrl}: ${contentType}`);
            continue;
          }

          const deals = response.data?.data || [];
          console.log(`✅ SUCCESS with JSON response: ${fullUrl}`);
          console.log(`📋 Found ${deals.length} deals:`, deals.slice(0, 2));

          process.env.ZOHO_BIGIN_WORKING_URL = baseUrl;
          console.log(`🎯 Storing working base URL: ${baseUrl}`);

          return deals;
        } catch (error) {
          const status = error.response?.status || error.code;
          const contentType = error.response?.headers?.['content-type'] || '';

          console.log(`❌ Failed ${fullUrl}: ${status}`);

          if (contentType.includes('text/html')) {
            console.log(`🚫 Skipping ${fullUrl} - returned HTML instead of JSON API`);
          }
        }
      }
    }

    console.log("❌ No working JSON API endpoint found for Zoho Bigin deals");
    throw new Error("No working Zoho Bigin API endpoint found");
  } catch (error) {
    console.error("❌ Failed to fetch Zoho deals:", error.message);
    return [];
  }
}

export async function uploadToZohoBigin(
  pdfBuffer,
  fileName = "document.pdf",
  recordId = null
) {
  console.log("🔥 Uploading to Zoho Bigin using deals/attachments...");
  try {
    const accessToken = await getZohoAccessToken();

    let baseUrl = process.env.ZOHO_BIGIN_DETECTED_BASE || process.env.ZOHO_BIGIN_WORKING_URL;

    if (!baseUrl) {
      console.log("🔍 No cached base URL, running auto-detection for upload...");
      baseUrl = await detectZohoBiginBaseUrl();
    }

    if (!baseUrl) {
      baseUrl = "https://www.zohoapis.com/bigin/v1";
      console.log("⚠️ Using fallback base URL:", baseUrl);
    }

    let dealId = recordId;
    if (!dealId) {
      console.log("🔍 No deal ID provided, fetching available deals...");
      const deals = await getZohoDeals();

      if (deals.length === 0) {
        console.log("🆕 No deals found, creating a default deal for file attachments...");
        const newDeal = await createDefaultDeal();
        if (newDeal && newDeal.id) {
          dealId = newDeal.id;
          console.log("✅ Created new deal for attachments:", dealId, "-", newDeal.Deal_Name);
        } else {
          throw new Error("Failed to create default deal for file attachments");
        }
      } else {
        dealId = deals[0].id;
        console.log("✅ Using first available deal:", dealId, "-", deals[0].Deal_Name);
      }
    }

    console.log("🚀 Uploading to Zoho Bigin deals/attachments...");
    console.log("🌍 Bigin API URL being used:", baseUrl);
    console.log("📌 Deal ID:", dealId);
    console.log("📎 File Name:", fileName);

    const formData = new FormData();
    formData.append("file", pdfBuffer, {
      filename: fileName,
      contentType: "application/pdf",
    });

    const uploadResponse = await axios.post(
      `${baseUrl}/Deals/${dealId}/Attachments`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    console.log("🔍 Zoho Bigin deals/attachments upload response:", JSON.stringify(uploadResponse.data, null, 2));

    const fileData = uploadResponse.data?.data?.[0] || uploadResponse.data;
    const fileId = fileData?.details?.id || fileData?.id;

    console.log("📋 Parsed Zoho response:", { fileId, dealId, status: fileData?.status });

    return {
      fileId: fileId || `ATTACH_${Date.now()}`,
      url: `${baseUrl}/Deals/${dealId}/Attachments/${fileId}`,
      dealId: dealId,
    };
  } catch (error) {
    console.error("❌ Zoho Bigin deals/attachments upload error:", error.response?.data || error.message);

    if (error.response) {
      console.error("❌ Zoho Bigin API Error Details:");
      console.error("Status:", error.response.status);
      console.error("Headers:", JSON.stringify(error.response.headers, null, 2));
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    }

    return {
      fileId: `MOCK_ATTACH_${Date.now()}`,
      url: null,
      dealId: recordId || null,
      error: error.message,
    };
  }
}

async function createDefaultDeal() {
  try {
    const accessToken = await getZohoAccessToken();

    console.log("🆕 Creating default deal for PDF attachments...");

    let baseUrlToTry = process.env.ZOHO_BIGIN_DETECTED_BASE || process.env.ZOHO_BIGIN_WORKING_URL;

    if (!baseUrlToTry) {
      console.log("🔍 No cached endpoint for deal creation, running auto-detection...");
      baseUrlToTry = await detectZohoBiginBaseUrl();
    }

    if (baseUrlToTry) {
      const createUrl = `${baseUrlToTry}/Pipelines`;
      console.log(`🔨 Testing deal creation with v2 Pipelines endpoint: ${createUrl}`);

      try {
        const dealData = {
          data: [
            {
              Deal_Name: "PDF Documents Storage",
              Sub_Pipeline: "Sales Pipeline Standard",
              Stage: "Proposal/Price Quote",
              Amount: 0,
              Closing_Date: new Date().toISOString().split('T')[0]
            }
          ]
        };

        const response = await axios.post(
          createUrl,
          dealData,
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            timeout: 10000
          }
        );

        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          console.log(`✅ SUCCESS with detected endpoint: ${createUrl}`);
          console.log("🔍 Deal creation response:", JSON.stringify(response.data, null, 2));

          const newDeal = response.data?.data?.[0]?.details || response.data?.data?.[0] || response.data;

          if (response.data?.data?.[0]?.code === "SUCCESS" && response.data?.data?.[0]?.details?.id) {
            const dealId = response.data.data[0].details.id;
            console.log("✅ Deal created successfully with ID:", dealId);

            return {
              id: dealId,
              Deal_Name: "PDF Documents Storage"
            };
          }

          if (newDeal && (newDeal.id || newDeal.Deal_Name)) {
            return newDeal;
          }
        }
      } catch (error) {
        console.log(`❌ Detected endpoint failed for deal creation: ${error.response?.status || error.code}`);
        if (error.response?.data) {
          console.log(`🔍 API Error:`, error.response.data);
        }
      }
    }

    const possibleCreateUrls = [
      "https://www.zohoapis.com/bigin/v1/Pipelines",
      "https://www.zohoapis.in/bigin/v1/Pipelines",
      "https://www.zohoapis.eu/bigin/v1/Pipelines",
      "https://www.zohoapis.com.au/bigin/v1/Pipelines",
      "https://www.zohoapis.com/bigin/v2/Pipelines",
      "https://www.zohoapis.in/bigin/v2/Pipelines",
      "https://www.zohoapis.eu/bigin/v2/Pipelines",
      "https://www.zohoapis.com.au/bigin/v2/Pipelines",
      "https://bigin.zoho.com/crm/v2/Pipelines",
      "https://bigin.zoho.in/crm/v2/Pipelines",
      "https://bigin.zoho.eu/crm/v2/Pipelines",
      "https://bigin.zoho.com.au/crm/v2/Pipelines"
    ];

    const dealData = {
      data: [
        {
          Deal_Name: "PDF Documents Storage",
          Sub_Pipeline: "Sales Pipeline Standard",
          Stage: "Proposal/Price Quote",
          Amount: 0,
          Closing_Date: new Date().toISOString().split('T')[0]
        }
      ]
    };

    for (const createUrl of possibleCreateUrls) {
      try {
        console.log(`🔨 Testing deal creation at: ${createUrl}`);

        const response = await axios.post(
          createUrl,
          dealData,
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            timeout: 10000
          }
        );

        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('application/json')) {
          console.log(`❌ Non-JSON response from ${createUrl}: ${contentType}`);
          continue;
        }

        console.log(`✅ SUCCESS with JSON response: ${createUrl}`);
        console.log("🔍 Full deal creation response:", JSON.stringify(response.data, null, 2));

        const newDeal =
          response.data?.data?.[0]?.details ||
          response.data?.data?.[0] ||
          response.data ||
          null;

        console.log("✅ Parsed new deal:", newDeal);

        if (response.data?.data?.[0]?.code === "SUCCESS" && response.data?.data?.[0]?.details?.id) {
          const dealId = response.data.data[0].details.id;
          console.log("✅ Deal created successfully with ID:", dealId);

          process.env.ZOHO_BIGIN_WORKING_URL = createUrl.replace('/Deals', '');
          console.log(`🎯 Storing working create URL base: ${process.env.ZOHO_BIGIN_WORKING_URL}`);

          return {
            id: dealId,
            Deal_Name: "PDF Documents Storage"
          };
        }

        if (newDeal && (newDeal.id || newDeal.Deal_Name)) {
          process.env.ZOHO_BIGIN_WORKING_URL = createUrl.replace('/Deals', '');
          console.log(`🎯 Storing working create URL base: ${process.env.ZOHO_BIGIN_WORKING_URL}`);

          return newDeal;
        }

        console.log(`⚠️ Got JSON response but no valid deal data from ${createUrl}`);

      } catch (error) {
        const status = error.response?.status || error.code;
        const contentType = error.response?.headers?.['content-type'] || '';

        console.log(`❌ Failed ${createUrl}: ${status}`);

        if (contentType.includes('text/html')) {
          console.log(`🚫 Skipping ${createUrl} - returned HTML instead of JSON API`);
        } else if (error.response?.data) {
          console.log(`🔍 API Error from ${createUrl}:`, error.response.data);
        }
      }
    }

    console.log("❌ No working JSON API endpoint found for deal creation");
    throw new Error("No working Zoho Bigin API endpoint found for deal creation");

  } catch (error) {
    console.error("❌ Failed to create default deal:", error.message);
    return null;
  }
}

export async function uploadToZohoCRM(
  pdfBuffer,
  fileName = "document.pdf",
  recordId = null
) {
  console.log("Uploading to Zoho CRM...");
  try {
    const accessToken = await getZohoAccessToken();

    console.log("🚀 Uploading to Zoho CRM...");
    console.log("🌍 CRM API URL being used:", ZOHO_CRM_API_URL);
    console.log(
      "🔐 CRM Access Token being sent:",
      accessToken.substring(0, 20),
      "..."
    );
    console.log("📎 File Name:", fileName);
    console.log("📌 CRM Record ID:", recordId || "none");

    const formData = new FormData();
    formData.append("file", pdfBuffer, {
      filename: fileName,
      contentType: "application/pdf",
    });

    const uploadResponse = await axios.post(
      `${ZOHO_CRM_API_URL}/files`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      }
    );

    const fileData = uploadResponse.data?.data?.[0] || uploadResponse.data;
    const fileId = fileData?.id;
    const fileUrl = fileData?.download_url || null;

    return {
      fileId: fileId || `CRM_FILE_${Date.now()}`,
      url: fileUrl || null,
      dealId: recordId || null,
    };
  } catch (error) {
    console.error(
      "Zoho CRM upload error:",
      error.response?.data || error.message
    );
    return {
      fileId: `MOCK_CRM_FILE_${Date.now()}`,
      url: null,
      dealId: recordId || null,
      error: error.message,
    };
  }
}

let tokenRefreshInProgress = false;
let tokenRefreshPromise = null;

let cachedAccessToken = null;
let tokenExpiryTime = null;

function isCachedTokenValid() {
  if (!cachedAccessToken || !tokenExpiryTime) {
    return false;
  }

  const bufferTime = 5 * 60 * 1000;
  const now = Date.now();
  const expiryWithBuffer = tokenExpiryTime - bufferTime;

  return now < expiryWithBuffer;
}

export async function getZohoAccessToken() {
  if (isCachedTokenValid()) {
    const remainingMinutes = Math.round((tokenExpiryTime - Date.now()) / 60000);
    console.log(`🎯 [TOKEN-CACHE] Using cached token (${remainingMinutes} minutes remaining)`);
    return cachedAccessToken;
  }

  // If another refresh is already in progress, wait for it
  if (tokenRefreshInProgress && tokenRefreshPromise) {
    console.log('🔄 [TOKEN-MUTEX] Another token refresh in progress, waiting...');
    try {
      const token = await tokenRefreshPromise;
      return token; // Return the token from the other request
    } catch (error) {
      console.log('🔄 [TOKEN-MUTEX] Previous refresh failed, will try again...');
      // Fall through to try our own refresh
    }
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_BASE || ZOHO_ACCOUNTS_URL;

  // Skip debug logging of credentials for security
  const hasCredentials = clientId && clientSecret && refreshToken &&
    !clientId.includes('your_') && !clientSecret.includes('your_') && !refreshToken.includes('your_');

  if (hasCredentials) {
    tokenRefreshInProgress = true;
    tokenRefreshPromise = (async () => {
      try {
        console.log("🔄 Auto-refreshing Zoho access token...");

        const response = await axios.post(
          `${accountsUrl}/oauth/v2/token`,
          null,
          {
            params: {
              refresh_token: refreshToken,
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "refresh_token",
            },
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );

        const { access_token, expires_in } = response.data;

        if (!access_token) {
          throw new Error('No access_token in response from Zoho');
        }

        console.log(`✅ Auto-refreshed Zoho token successfully!`);
        console.log(`  ├ Token length: ${access_token.length} characters`);
        console.log(`  ├ Expires in: ${expires_in} seconds (${Math.round(expires_in/3600)} hours)`);

        cachedAccessToken = access_token;
        tokenExpiryTime = Date.now() + (expires_in * 1000);
        console.log(`🎯 [TOKEN-CACHE] Token cached until ${new Date(tokenExpiryTime).toLocaleString()}`);

        return access_token;
      } catch (error) {
        console.error("❌ Failed to auto-refresh Zoho token:");
        console.error("  ├ Error type:", error.name || 'Unknown');
        console.error("  ├ Error message:", error.message);
        console.error("  ├ Response status:", error.response?.status);
        if (error.response?.data) {
          console.error("  └ Response data:", JSON.stringify(error.response.data, null, 2));
        }
        throw error;
      }
    })();

    try {
      const token = await tokenRefreshPromise;
      return token;
    } catch (error) {
      console.log("🔄 [TOKEN-MUTEX] Refresh failed, falling back to static token");
    } finally {
      tokenRefreshInProgress = false;
      tokenRefreshPromise = null;
    }
  } else {
    if (clientId?.includes('your_') || clientSecret?.includes('your_') || refreshToken?.includes('your_')) {
      console.log("⚠️  Zoho credentials contain placeholder values - please update .env with real credentials");
    } else {
      console.log("⚠️  Missing OAuth credentials for Zoho token refresh");
    }
  }

  if (process.env.ZOHO_ACCESS_TOKEN) {
    const token = process.env.ZOHO_ACCESS_TOKEN.trim();
    console.log("⚠️  Using static Zoho access token (may expire soon):", token.substring(0, 25), "...");
    console.log("💡 Recommendation: Set up permanent refresh token via OAuth for automatic renewal");
    return token;
  }

  console.error("❌ No Zoho credentials configured");
  const serverUrl = process.env.SERVER_URL || "http://localhost:5000";
  console.error(`💡 Admin setup required: Visit ${serverUrl}/oauth/zoho/auth to configure Zoho integration`);

  throw new Error("Zoho integration not configured. Administrator needs to set up OAuth credentials.");
}


async function attachFileToRecord(recordId, fileId, accessToken, apiUrl) {
  try {
    await axios.post(
      `${apiUrl}/records/${recordId}/attachments`,
      { file_id: fileId },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "Failed to attach file to record:",
      error.response?.data || error.message
    );
  }
}

export async function getBiginContactsByAccount(accountId) {
  console.log(`👤 Fetching contacts for account: ${accountId}`);

  try {
    const coqlQuery = `SELECT id, Contact_Name, Email, Phone
                       FROM Contacts
                       WHERE Account_Name = '${accountId}'
                       LIMIT 10`;

    console.log(`🔍 [V8-CONTACTS] Using COQL to fetch contacts for account ${accountId}`);
    const coqlResult = await makeBiginRequest('POST', '/coql', {
      select_query: coqlQuery
    });

    if (coqlResult.success && coqlResult.data?.data) {
      const contacts = coqlResult.data.data;
      console.log(`✅ [V8-CONTACTS] Found ${contacts.length} contacts via COQL`);
      return {
        success: true,
        contacts: contacts.map(contact => ({
          id: contact.id,
          name: contact.Contact_Name || 'Unnamed Contact',
          email: contact.Email || '',
          phone: contact.Phone || ''
        }))
      };
    }

    console.log(`🔄 [V8-CONTACTS] COQL failed, trying direct Contacts endpoint`);

    const contactFields = ['id', 'Contact_Name', 'Email', 'Phone'].join(',');
    const directResult = await makeBiginRequest('GET', `/Contacts?Account_Name=${accountId}&fields=${contactFields}`);

    if (directResult.success && directResult.data?.data) {
      const contacts = directResult.data.data;
      console.log(`✅ [V8-CONTACTS] Found ${contacts.length} contacts via direct endpoint`);
      return {
        success: true,
        contacts: contacts.map(contact => ({
          id: contact.id,
          name: contact.Contact_Name || 'Unnamed Contact',
          email: contact.Email || '',
          phone: contact.Phone || ''
        }))
      };
    }

    console.log(`⚠️ [V8-CONTACTS] No contacts found for account ${accountId}`);
    return {
      success: true,
      contacts: []
    };

  } catch (error) {
    console.error(`❌ [V8-CONTACTS] Failed to fetch contacts for account ${accountId}:`, error.message);
    return {
      success: false,
      error: error.message,
      contacts: []
    };
  }
}

export async function createDefaultBiginContact(accountId, accountName) {
  console.log(`👤 Creating default contact for account: ${accountId} (${accountName})`);

  try {
    const contactData = {
      data: [{
        Contact_Name: `${accountName} - Main Contact`,
        Account_Name: {
          id: accountId
        },
        Email: `info@${accountName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        Description: `Default contact created for ${accountName} by EnviroMaster system on ${new Date().toISOString()}`
      }]
    };

    console.log(`🔍 [V8-CONTACTS] Creating contact payload:`, JSON.stringify(contactData, null, 2));

    const result = await makeBiginRequest('POST', '/Contacts', contactData);

    if (result.success) {
      const createdContact = result.data?.data?.[0];
      console.log(`🔍 [V8-CONTACTS] Contact creation response:`, JSON.stringify(result.data, null, 2));

      if (createdContact?.code === 'SUCCESS') {
        console.log(`✅ [V8-CONTACTS] Contact created successfully: ${createdContact.details.id}`);
        return {
          success: true,
          contact: {
            id: createdContact.details.id,
            name: `${accountName} - Main Contact`,
            email: `info@${accountName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
            phone: ''
          }
        };
      } else {
        console.error(`❌ [V8-CONTACTS] Contact creation failed:`, result.data);
        return {
          success: false,
          error: result.data
        };
      }
    }

    console.error(`❌ [V8-CONTACTS] Contact creation API call failed:`, result.error);
    return {
      success: false,
      error: result.error
    };

  } catch (error) {
    console.error(`❌ [V8-CONTACTS] Failed to create default contact:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getOrCreateContactForDeal(accountId, accountName) {
  console.log(`🔗 [V8-CONTACTS] Getting or creating contact for deal creation...`);

  try {
    const contactsResult = await getBiginContactsByAccount(accountId);

    if (contactsResult.success && contactsResult.contacts.length > 0) {
      const contact = contactsResult.contacts[0]; 
      console.log(`✅ [V8-CONTACTS] Using existing contact: ${contact.name} (${contact.id})`);
      return {
        success: true,
        contact: contact,
        wasCreated: false
      };
    }

    console.log(`🆕 [V8-CONTACTS] No existing contacts found, creating default contact...`);
    const createResult = await createDefaultBiginContact(accountId, accountName);

    if (createResult.success) {
      console.log(`✅ [V8-CONTACTS] Created new default contact: ${createResult.contact.name} (${createResult.contact.id})`);
      return {
        success: true,
        contact: createResult.contact,
        wasCreated: true
      };
    }

    console.error(`❌ [V8-CONTACTS] Failed to get or create contact:`, createResult.error);
    return {
      success: false,
      error: createResult.error
    };

  } catch (error) {
    console.error(`❌ [V8-CONTACTS] Exception in getOrCreateContactForDeal:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
export async function recordZohoPdf({ fileName, size, mimeType, url }) {
  return { zohoRecordId: `ZHO_${Date.now()}` };
}

export async function testV10LayoutPipelineCompatibility() {
  console.log(`🔍 [V10-COMPAT-TEST] Testing Layout+Pipeline compatibility matching...`);

  try {
    const compatiblePairs = [];

    const layoutResult = await makeBiginRequest('GET', '/settings/layouts?module=Deals');

    if (layoutResult.success && layoutResult.data?.layouts) {
      const layouts = layoutResult.data.layouts;
      console.log(`✅ [V10-COMPAT-TEST] Found ${layouts.length} layouts to analyze`);

      for (const layout of layouts) {
        console.log(`🔍 [V10-COMPAT-TEST] Analyzing layout: "${layout.name}" (ID: ${layout.id}, visible: ${layout.visible})`);

        const layoutInfo = {
          id: layout.id,
          name: layout.name,
          visible: layout.visible,
          pipelines: []
        };

        if (layout.sections) {
          for (const section of layout.sections) {
            const pipelineField = section.fields?.find(f => f.api_name === 'Pipeline');
            if (pipelineField && pipelineField.pick_list_values) {
              console.log(`  📋 Found ${pipelineField.pick_list_values.length} Pipeline options in this layout:`);
              pipelineField.pick_list_values.forEach((pipeline, index) => {
                const pipelineValue = pipeline.actual_value || pipeline.display_value;
                console.log(`    ${index + 1}. "${pipeline.display_value}" (actual: "${pipelineValue}")`);

                layoutInfo.pipelines.push({
                  display: pipeline.display_value,
                  actual: pipelineValue
                });

                compatiblePairs.push({
                  layoutId: layout.id,
                  layoutName: layout.name,
                  pipelineDisplay: pipeline.display_value,
                  pipelineActual: pipelineValue,
                  visible: layout.visible
                });
              });
              break;
            }
          }
        }

        if (layoutInfo.pipelines.length === 0) {
          console.log(`  ⚠️ No Pipeline field found in this layout`);
        }
      }

      console.log(`\n✅ [V10-COMPAT-TEST] COMPATIBILITY ANALYSIS COMPLETE:`);
      console.log(`📊 Found ${compatiblePairs.length} compatible Layout+Pipeline combinations`);

      const visiblePairs = compatiblePairs.filter(pair => pair.visible);
      console.log(`🔍 Visible Layout+Pipeline combinations (${visiblePairs.length}):`);
      visiblePairs.slice(0, 5).forEach((pair, index) => {
        console.log(`  ${index + 1}. Layout: "${pair.layoutName}" + Pipeline: "${pair.pipelineActual}"`);
      });

      if (visiblePairs.length > 0) {
        const recommended = visiblePairs[0];
        console.log(`\n🎯 [V10-COMPAT-TEST] RECOMMENDED for V10:`);
        console.log(`  📐 Layout: "${recommended.layoutName}" (ID: ${recommended.layoutId})`);
        console.log(`  🔗 Pipeline: "${recommended.pipelineActual}"`);
        console.log(`  ✅ This combination is guaranteed to be compatible!`);

        return {
          success: true,
          compatiblePairs: compatiblePairs,
          visiblePairs: visiblePairs,
          recommended: recommended,
          totalLayouts: layouts.length,
          totalCompatiblePairs: compatiblePairs.length
        };
      } else {
        console.log(`❌ [V10-COMPAT-TEST] No visible Layout+Pipeline pairs found!`);
        return {
          success: false,
          error: 'No visible Layout+Pipeline pairs found',
          compatiblePairs: compatiblePairs,
          totalLayouts: layouts.length
        };
      }

    } else {
      console.log(`❌ [V10-COMPAT-TEST] Failed to fetch layouts`);
      return {
        success: false,
        error: 'Failed to fetch layouts',
        details: layoutResult.error
      };
    }

  } catch (error) {
    console.error(`❌ [V10-COMPAT-TEST] Compatibility test failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
export async function testV9SimplePipelineDetection() {
  console.log(`🔍 [V9-SIMPLE-TEST] Testing simple Pipeline detection from field metadata...`);

  try {
    const fieldsResult = await makeBiginRequest('GET', '/settings/fields?module=Deals');

    if (fieldsResult.success && fieldsResult.data?.fields) {
      const pipelineField = fieldsResult.data.fields.find(f => f.api_name === 'Pipeline');

      if (pipelineField) {
        console.log(`✅ [V9-SIMPLE-TEST] Found Pipeline field:`);
        console.log(`  - Data type: ${pipelineField.data_type}`);
        console.log(`  - Required: ${pipelineField.required}`);
        console.log(`  - Read only: ${pipelineField.read_only}`);

        if (pipelineField.pick_list_values && pipelineField.pick_list_values.length > 0) {
          console.log(`  - Available values (${pipelineField.pick_list_values.length}):`);
          pipelineField.pick_list_values.forEach((pipeline, index) => {
            console.log(`    ${index + 1}. "${pipeline.display_value}" (actual: "${pipeline.actual_value || pipeline.display_value}")`);
          });

          const firstPipeline = pipelineField.pick_list_values[0];
          const selectedValue = firstPipeline.actual_value || firstPipeline.display_value;
          console.log(`🎯 [V9-SIMPLE-TEST] V9 will use: "${selectedValue}"`);

          return {
            success: true,
            pipelineField: {
              dataType: pipelineField.data_type,
              required: pipelineField.required,
              readOnly: pipelineField.read_only,
              availableValues: pipelineField.pick_list_values.map(p => ({
                display: p.display_value,
                actual: p.actual_value || p.display_value
              })),
              selectedValue: selectedValue
            }
          };
        } else {
          console.log(`⚠️ [V9-SIMPLE-TEST] Pipeline field has no picklist values`);
          return {
            success: false,
            error: 'Pipeline field has no picklist values'
          };
        }
      } else {
        console.log(`❌ [V9-SIMPLE-TEST] Pipeline field not found in Deals module`);
        return {
          success: false,
          error: 'Pipeline field not found in Deals module'
        };
      }
    } else {
      console.log(`❌ [V9-SIMPLE-TEST] Could not fetch Deals field metadata`);
      return {
        success: false,
        error: 'Could not fetch Deals field metadata',
        details: fieldsResult.error
      };
    }

  } catch (error) {
    console.error(`❌ [V9-SIMPLE-TEST] Pipeline detection failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
export async function testLayoutPipelineDetection() {
  console.log(`🔍 [V7-DIAGNOSTIC] Testing Layout and Pipeline detection...`);

  try {
    const layoutResult = await makeBiginRequest('GET', '/settings/layouts?module=Deals');

    if (layoutResult.success && layoutResult.data?.layouts) {
      const layouts = layoutResult.data.layouts;
      console.log(`✅ [V7-DIAGNOSTIC] Found ${layouts.length} layouts:`);

      layouts.forEach((layout, index) => {
        console.log(`  Layout ${index + 1}: ${layout.name} (ID: ${layout.id}, visible: ${layout.visible})`);

        if (layout.sections) {
          layout.sections.forEach((section, sectionIndex) => {
            const pipelineField = section.fields?.find(f => f.api_name === 'Pipeline');
            if (pipelineField) {
              console.log(`    📋 Pipeline field found in section ${sectionIndex + 1}:`);
              console.log(`      - Field type: ${pipelineField.data_type}`);
              console.log(`      - Required: ${pipelineField.required}`);
              if (pipelineField.pick_list_values) {
                console.log(`      - Available pipelines: ${pipelineField.pick_list_values.map(p => p.display_value).join(', ')}`);
              }
            }
          });
        }
      });

      const defaultLayout = layouts.find(l => l.visible && !l.convert_mapping) || layouts[0];
      if (defaultLayout) {
        console.log(`🎯 [V7-DIAGNOSTIC] Selected layout: ${defaultLayout.name} (ID: ${defaultLayout.id})`);
        return {
          success: true,
          layoutId: defaultLayout.id,
          layoutName: defaultLayout.name,
          layouts: layouts.map(l => ({ id: l.id, name: l.name, visible: l.visible }))
        };
      }
    } else {
      console.log(`❌ [V7-DIAGNOSTIC] Failed to fetch layouts:`, layoutResult.error);
    }

    const fieldsResult = await makeBiginRequest('GET', '/settings/fields?module=Deals');
    if (fieldsResult.success && fieldsResult.data?.fields) {
      const pipelineField = fieldsResult.data.fields.find(f => f.api_name === 'Pipeline');
      if (pipelineField) {
        console.log(`🔍 [V7-DIAGNOSTIC] Pipeline field metadata:`);
        console.log(`  - Data type: ${pipelineField.data_type}`);
        console.log(`  - Required: ${pipelineField.required}`);
        console.log(`  - Read only: ${pipelineField.read_only}`);
        if (pipelineField.pick_list_values) {
          const availableValues = pipelineField.pick_list_values.map(p => `"${p.display_value}"`).join(', ');
          console.log(`  - Available values: ${availableValues}`);
        }
      }
    }

    return {
      success: false,
      error: 'No suitable layout found'
    };

  } catch (error) {
    console.error(`❌ [V7-DIAGNOSTIC] Layout detection failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
export async function runZohoDiagnostics() {
  console.log("🔧 [DIAGNOSTICS] Starting comprehensive Zoho integration test...");
  const results = {};

  try {
    console.log("\n📋 [TEST 1] Testing Zoho token refresh...");
    try {
      const token = await getZohoAccessToken();
      results.tokenRefresh = { success: true, tokenLength: token.length };
      console.log(`✅ Token refresh successful, length: ${token.length}`);
    } catch (error) {
      results.tokenRefresh = { success: false, error: error.message };
      console.log(`❌ Token refresh failed: ${error.message}`);
    }

    console.log("\n📋 [TEST 2] Testing V10 Layout+Pipeline compatibility matching...");
    try {
      const compatTest = await testV10LayoutPipelineCompatibility();
      results.layoutPipelineCompatibilityV10 = compatTest;
      if (compatTest.success) {
        console.log(`✅ V10 Compatibility analysis successful: Found ${compatTest.totalCompatiblePairs} compatible pairs`);
        if (compatTest.recommended) {
          console.log(`🎯 V10 Recommended: "${compatTest.recommended.layoutName}" + "${compatTest.recommended.pipelineActual}"`);
        }
      } else {
        console.log(`❌ V10 Compatibility analysis failed: ${compatTest.error}`);
      }
    } catch (error) {
      results.layoutPipelineCompatibilityV10 = { success: false, error: error.message };
      console.log(`❌ V10 Compatibility analysis error: ${error.message}`);
    }

    console.log("\n📋 [TEST 3] Testing V9 Simple Pipeline detection (no Layout complexity)...");
    try {
      const pipelineTest = await testV9SimplePipelineDetection();
      results.simplePipelineDetectionV9 = pipelineTest;
      if (pipelineTest.success) {
        console.log(`✅ V9 Simple Pipeline detection successful: "${pipelineTest.pipelineField.selectedValue}"`);
        console.log(`📋 Available Pipeline options: ${pipelineTest.pipelineField.availableValues.length}`);
      } else {
        console.log(`❌ V9 Simple Pipeline detection failed: ${pipelineTest.error}`);
      }
    } catch (error) {
      results.simplePipelineDetectionV9 = { success: false, error: error.message };
      console.log(`❌ V9 Simple Pipeline detection error: ${error.message}`);
    }

    console.log("\n📋 [TEST 3] Testing V7 Layout+Pipeline detection (complex approach)...");
    try {
      const layoutTest = await testLayoutPipelineDetection();
      results.layoutPipelineDetection = layoutTest;
      if (layoutTest.success) {
        console.log(`✅ V7 Layout detection successful: ${layoutTest.layoutName} (${layoutTest.layoutId})`);
      } else {
        console.log(`❌ V7 Layout detection failed: ${layoutTest.error}`);
      }
    } catch (error) {
      results.layoutPipelineDetection = { success: false, error: error.message };
      console.log(`❌ V7 Layout detection error: ${error.message}`);
    }

    console.log("\n📋 [TEST 4] Testing endpoint auto-detection...");
    try {
      const baseUrl = await detectZohoBiginBaseUrl();
      results.autoDetection = { success: !!baseUrl, baseUrl };
      if (baseUrl) {
        console.log(`✅ Auto-detection successful: ${baseUrl}`);
      } else {
        console.log(`❌ Auto-detection failed - no working endpoint found`);
      }
    } catch (error) {
      results.autoDetection = { success: false, error: error.message };
      console.log(`❌ Auto-detection error: ${error.message}`);
    }

    console.log("\n📋 [TEST 5] Testing deals fetching...");
    try {
      const deals = await getZohoDeals();
      results.dealsFetch = { success: true, dealCount: deals.length };
      console.log(`✅ Deals fetch successful, found ${deals.length} deals`);
      if (deals.length > 0) {
        console.log(`📄 First deal: ${deals[0].Deal_Name || deals[0].name || 'Unnamed'}`);
      }
    } catch (error) {
      results.dealsFetch = { success: false, error: error.message };
      console.log(`❌ Deals fetch failed: ${error.message}`);
    }

    console.log("\n📋 [TEST 7] Testing deal creation with V10 Layout+Pipeline compatibility fix...");
    try {
      const newDeal = await createBiginDeal({
        dealName: 'V10-COMPATIBILITY-TEST-DEAL-' + Date.now(),
        stage: 'Proposal/Price Quote',
        amount: 1000,
        description: 'V10 Layout+Pipeline compatibility test deal creation'
      });
      results.dealCreationV10 = { success: !!newDeal, dealId: newDeal?.id };
      if (newDeal) {
        console.log(`✅ V10 Deal creation successful, ID: ${newDeal.id}`);
      } else {
        console.log(`❌ V10 Deal creation failed - no deal returned`);
      }
    } catch (error) {
      results.dealCreationV10 = { success: false, error: error.message };
      console.log(`❌ V10 Deal creation error: ${error.message}`);
    }

    console.log("\n📋 [TEST 8] Testing V8 Contact creation for deal linking...");
    try {
      const companies = await getBiginCompanies(1, 5);
      if (companies.success && companies.companies.length > 0) {
        const testCompany = companies.companies[0];
        console.log(`🏢 [V8-TEST] Testing contact creation with company: ${testCompany.name} (${testCompany.id})`);

        const contactResult = await getOrCreateContactForDeal(testCompany.id, testCompany.name);
        results.contactCreationV8 = {
          success: contactResult.success,
          contactId: contactResult.contact?.id,
          wasCreated: contactResult.wasCreated
        };

        if (contactResult.success) {
          console.log(`✅ V8 Contact creation successful: ${contactResult.contact.name} (${contactResult.contact.id})`);
          if (contactResult.wasCreated) {
            console.log(`🆕 V8 Contact was created automatically`);
          } else {
            console.log(`🔍 V8 Used existing contact`);
          }
        } else {
          console.log(`❌ V8 Contact creation failed: ${contactResult.error}`);
        }
      } else {
        results.contactCreationV8 = { success: false, error: 'No companies available for contact test' };
        console.log(`❌ V8 Contact test skipped - no companies available`);
      }
    } catch (error) {
      results.contactCreationV8 = { success: false, error: error.message };
      console.log(`❌ V8 Contact creation error: ${error.message}`);
    }
    console.log("\n🏁 [SUMMARY] V10 Zoho Integration Diagnostic Results:");
    console.log("=" .repeat(60));
    console.log(`Token Refresh: ${results.tokenRefresh?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`V10 Layout+Pipeline Compatibility: ${results.layoutPipelineCompatibilityV10?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`V9 Simple Pipeline: ${results.simplePipelineDetectionV9?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`V7 Layout Detection: ${results.layoutPipelineDetection?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Auto-Detection: ${results.autoDetection?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Deals Fetching: ${results.dealsFetch?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`V10 Deal Creation: ${results.dealCreationV10?.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`V8 Contact Creation: ${results.contactCreationV8?.success ? '✅ PASS' : '❌ FAIL'}`);

    if (results.autoDetection?.baseUrl) {
      console.log(`\n🎯 Detected working endpoint: ${results.autoDetection.baseUrl}`);
    }

    if (results.layoutPipelineCompatibilityV10?.success && results.layoutPipelineCompatibilityV10.recommended) {
      const rec = results.layoutPipelineCompatibilityV10.recommended;
      console.log(`🎯 V10 Recommended Compatible Pair: "${rec.layoutName}" + "${rec.pipelineActual}"`);
    }

    if (results.simplePipelineDetectionV9?.success) {
      console.log(`🎯 V9 Selected Pipeline: "${results.simplePipelineDetectionV9.pipelineField.selectedValue}"`);
    }

    if (results.layoutPipelineDetection?.layoutId) {
      console.log(`🎯 V7 Layout ID: ${results.layoutPipelineDetection.layoutId} (${results.layoutPipelineDetection.layoutName})`);
    }

    if (results.contactCreationV8?.contactId) {
      console.log(`🎯 V8 Contact ID: ${results.contactCreationV8.contactId} (${results.contactCreationV8.wasCreated ? 'Created' : 'Existing'})`);
    }

    const passCount = Object.values(results).filter(r => r.success).length;
    console.log(`\n📊 Overall Score: ${passCount}/8 tests passed`);

    const v10Success = results.dealCreationV10?.success;
    const v9Success = results.dealCreationV9?.success;
    const v7Success = results.dealCreationV7?.success;

    if (v10Success && !v9Success && !v7Success) {
      console.log(`\n🏆 V10 COMPATIBILITY approach succeeded where V9 and V7 failed!`);
    } else if (v10Success) {
      console.log(`\n✅ V10 COMPATIBILITY approach works! This should resolve the MAPPING_MISMATCH error.`);
    } else {
      console.log(`\n❌ Even V10 COMPATIBILITY approach failed. More investigation needed.`);
    }

    return results;

  } catch (error) {
    console.error("❌ [DIAGNOSTICS] Failed to run diagnostics:", error.message);
    return { error: error.message };
  }
}

function getBiginBaseUrl() {
  if (process.env.ZOHO_BIGIN_DETECTED_BASE || process.env.ZOHO_BIGIN_WORKING_URL) {
    return process.env.ZOHO_BIGIN_DETECTED_BASE || process.env.ZOHO_BIGIN_WORKING_URL;
  }

  const accountsUrl = process.env.ZOHO_ACCOUNTS_BASE || ZOHO_ACCOUNTS_URL;

  if (accountsUrl.includes('.in')) {
    return "https://www.zohoapis.in/bigin/v2";
  } else if (accountsUrl.includes('.eu')) {
    return "https://www.zohoapis.eu/bigin/v2";
  } else if (accountsUrl.includes('.com.au')) {
    return "https://www.zohoapis.com.au/bigin/v2";
  } else {
    return "https://www.zohoapis.com/bigin/v2";
  }
}

async function makeBiginRequest(method, endpoint, data = null) {
  try {
    const accessToken = await getZohoAccessToken();
    const baseUrl = getBiginBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    const config = {
      method,
      url,
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      config.data = data;
    }

    console.log(`📡 [BIGIN API] ${method} ${endpoint}`);
    console.log(`🌍 [BIGIN API] Using base URL: ${baseUrl}`);
    const response = await axios(config);

    return {
      success: true,
      data: response.data,
      status: response.status
    };

  } catch (error) {
    console.error(`❌ [BIGIN API] ${method} ${endpoint} failed:`, error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || { message: error.message },
      status: error.response?.status
    };
  }
}

export async function getBiginDealsByCompany(companyId, page = 1, perPage = 20) {
  console.log(`💼 Fetching Bigin deals for company: ${companyId} (page ${page}, ${perPage} per page)`);

  try {
    const dealFields = [
      'id',
      'Deal_Name',
      'Stage',
      'Amount',
      'Closing_Date',
      'Created_Time',
      'Modified_Time',
      'Description',
      'Pipeline',
      'Contact_Name'
    ].join(',');

    // Use /Pipelines/search with criteria (avoids COQL scope requirement)
    const criteria = encodeURIComponent(`(Account_Name:equals:${companyId})`);
    const endpoint = `/Pipelines/search?criteria=${criteria}&fields=${dealFields}&page=${page}&per_page=${Math.min(perPage, 200)}`;

    console.log(`🔍 [COMPANY-DEALS] Searching pipelines for company ${companyId}`);
    const result = await makeBiginRequest('GET', endpoint);

    if (result.success && result.data?.data) {
      const deals = result.data.data;
      console.log(`✅ [COMPANY-DEALS] Found ${deals.length} pipelines`);

      return {
        success: true,
        deals: deals.map(deal => ({
          id: deal.id,
          name: deal.Deal_Name || 'Unnamed Pipeline',
          stage: deal.Stage || '',
          amount: deal.Amount || 0,
          closingDate: deal.Closing_Date || null,
          createdAt: deal.Created_Time || null,
          modifiedAt: deal.Modified_Time || null,
          description: deal.Description || '',
          pipelineName: deal.Pipeline || '',
          contactName: deal.Contact_Name?.name || null
        })),
        pagination: {
          page: page,
          perPage: perPage,
          total: result.data.info?.count || deals.length,
          hasMore: result.data.info?.more_records || false
        }
      };
    }

    console.log(`⚠️ [COMPANY-DEALS] No pipelines found for company ${companyId}`);
    return {
      success: true,
      deals: [],
      pagination: {
        page: page,
        perPage: perPage,
        total: 0,
        hasMore: false
      }
    };

  } catch (error) {
    console.error(`❌ [COMPANY-DEALS] Failed to fetch deals for company ${companyId}:`, error.message);
    return {
      success: false,
      error: error.message,
      deals: []
    };
  }
}

export async function getBiginUsers() {
  console.log(`👥 Fetching Bigin users...`);
  const result = await makeBiginRequest('GET', '/users?type=AllUsers&per_page=200');
  console.log(`👥 [USERS] success:`, result.success, 'status:', result.status);
  console.log(`👥 [USERS] data keys:`, result.data ? Object.keys(result.data) : 'null');
  console.log(`👥 [USERS] error:`, result.error);
  if (result.success) {
    // Zoho Bigin returns `users` array
    const rawUsers = result.data?.users || result.data?.Users || [];
    console.log(`👥 [USERS] found ${rawUsers.length} users`);
    if (rawUsers.length > 0) console.log(`👥 [USERS] first user raw:`, JSON.stringify(rawUsers[0], null, 2));
    const users = rawUsers.map((u) => ({
      id: u.id,
      name: u.full_name || u.name || u.display_name || '',
      email: u.email || '',
    }));
    return { success: true, users };
  }
  return { success: false, users: [], error: result.error };
}

export async function getBiginCompanies(page = 1, perPage = 50) {
  console.log(`📋 Fetching Bigin companies (page ${page}, ${perPage} per page)...`);

  const fields = [
    'id',
    'Account_Name',
    'Company_Name',
    'Phone',
    'Email',
    'Website',
    'Billing_Street'
  ].join(',');

  const endpoint = `/Accounts?page=${page}&per_page=${Math.min(perPage, 200)}&fields=${fields}`;
  const result = await makeBiginRequest('GET', endpoint);

  if (result.success) {
    const companies = result.data?.data || [];
    console.log(`✅ Found ${companies.length} companies`);
    console.log(`✅ Found ${companies} companies`);
    return {
      success: true,
      companies: companies.map(company => ({
        id: company.id,
        name: company.Account_Name || company.Company_Name || 'Unnamed Company',
        phone: company.Phone || '',
        email: company.Email || '',
        website: company.Website || '',
        address: company.Billing_Street || ''
      })),
      pagination: result.data?.info || {}
    };
  }

  return result;
}

export async function getAllBiginCompanies() {
  console.log(`📋 Fetching ALL Bigin companies (all pages)...`);

  const fields = [
    'id',
    'Account_Name',
    'Company_Name',
    'Phone',
    'Email',
    'Website',
    'Billing_Street',
    'Billing_City',
    'Billing_State',
    'Billing_Code',
    'Billing_Country',
    'Industry',
    'Owner',
    'Description'
  ].join(',');

  const allCompanies = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const endpoint = `/Accounts?page=${page}&per_page=${perPage}&fields=${fields}`;
    const result = await makeBiginRequest('GET', endpoint);

    if (!result.success) {
      if (allCompanies.length > 0) break;
      return result;
    }

    const batch = result.data?.data || [];

    // Debug: log first company to see Owner structure
    if (batch.length > 0 && page === 1) {
      console.log('📋 Sample company data:', JSON.stringify(batch[0], null, 2));
    }

    allCompanies.push(...batch.map(company => ({
      id: company.id,
      name: company.Account_Name || company.Company_Name || 'Unnamed Company',
      phone: company.Phone || '',
      email: company.Email || '',
      website: company.Website || '',
      address: company.Billing_Street || '',
      city: company.Billing_City || '',
      state: company.Billing_State || '',
      zipCode: company.Billing_Code || '',
      country: company.Billing_Country || '',
      industry: company.Industry || '',
      // Owner can be object {name, id} or string
      owner: typeof company.Owner === 'object' ? (company.Owner?.name || '') : (company.Owner || ''),
      description: company.Description || ''
    })));

    const info = result.data?.info || {};
    const moreRecords = info.more_records ?? (batch.length === perPage);
    console.log(`📄 Page ${page}: fetched ${batch.length} companies (total so far: ${allCompanies.length}, more: ${moreRecords})`);

    if (!moreRecords || batch.length < perPage) break;
    page++;
  }

  console.log(`✅ Fetched all ${allCompanies.length} companies`);
  return { success: true, companies: allCompanies };
}

export async function searchBiginCompanies(searchTerm) {
  console.log(`🔍 Searching Bigin companies for: "${searchTerm}"`);

  const coqlQuery = `SELECT id, Account_Name, Phone, Email, Website
                     FROM Accounts
                     WHERE Account_Name LIKE '%${searchTerm}%'
                     LIMIT 200`;

  const endpoint = '/coql';
  const result = await makeBiginRequest('POST', endpoint, {
    select_query: coqlQuery
  });

  if (result.success) {
    const companies = result.data?.data || [];
    console.log(`✅ Found ${companies.length} companies matching "${searchTerm}"`);

    return {
      success: true,
      companies: companies.map(company => ({
        id: company.id,
        name: company.Account_Name || company.Company_Name || 'Unnamed Company',
        phone: company.Phone || '',
        email: company.Email || '',
        website: company.Website || ''
      }))
    };
  }

  return result;
}

export async function createBiginCompany(companyData) {
  console.log(`🏢 Creating new Bigin company: ${companyData.name}`);

  const record = {
    Account_Name: companyData.name,
  };
  if (companyData.phone) record.Phone = companyData.phone;
  if (companyData.email) record.Email = companyData.email;
  // Only include Website if it looks like a valid URL (starts with http/https or has a dot)
  const website = companyData.website;
  if (website && website !== 'None' && website !== 'none' && /[.\w]/.test(website) && !['none', 'n/a', 'na', '-'].includes(website.toLowerCase())) {
    record.Website = website.startsWith('http') ? website : `https://${website}`;
  }
  if (companyData.address) record.Billing_Street = companyData.address;

  const payload = { data: [record] };

  console.log(`📤 [CREATE COMPANY] Sending payload:`, JSON.stringify(payload, null, 2));
  const result = await makeBiginRequest('POST', '/Accounts', payload);
  console.log(`📥 [CREATE COMPANY] Full result:`, JSON.stringify(result, null, 2));

  if (result.success) {
    const createdCompany = result.data?.data?.[0];
    if (createdCompany?.code === 'SUCCESS') {
      console.log(`✅ Company created successfully: ${createdCompany.details.id}`);
      console.log(`🔍 Full Zoho response:`, JSON.stringify(result.data, null, 2));

      return {
        success: true,
        company: {
          id: createdCompany.details.id,
          name: companyData.name,
          phone: companyData.phone,
          email: companyData.email,
          website: companyData.website,
          address: companyData.address
        }
      };
    } else {
      console.error(`❌ Company creation failed:`, result.data);
      return {
        success: false,
        error: result.data
      };
    }
  }

  return result;
}

export async function createBiginDeal(dealData) {
  console.log(`💼 Creating new Bigin deal: ${dealData.dealName}`);

  const record = {
    Deal_Name: dealData.dealName,
    Sub_Pipeline: dealData.subPipelineName
                  || "Sales Pipeline Standard",
    Stage: dealData.stage || "Qualification",

    Amount: dealData.amount ?? 0,
    Closing_Date: dealData.closingDate
                  || new Date().toISOString().split("T")[0],
    Description:
      dealData.description
      || `EnviroMaster service proposal created on ${new Date().toISOString()}`
  };

  if (dealData.companyId) {
    record.Account_Name = { id: dealData.companyId };
  }

  if (dealData.contactId) {
    record.Contact_Name = { id: dealData.contactId };
  }

  const payload = { data: [record] };

  console.log(
    "🔍 [V2-Pipelines] Final payload:",
    JSON.stringify(payload, null, 2)
  );

  const result = await makeBiginRequest(
    "POST",
    "/Pipelines",
    payload
  );

  if (result.success) {
    const createdDeal = result.data?.data?.[0];
    console.log(`🔍 [DEAL CREATION] Full Zoho response:`, JSON.stringify(result.data, null, 2));

    if (createdDeal?.code === 'SUCCESS') {
      console.log(`✅ Deal created successfully: ${createdDeal.details.id}`);

      return {
        success: true,
        deal: {
          id: createdDeal.details.id,
          name: dealData.dealName,
          stage: dealData.stage,
          amount: dealData.amount,
          companyId: dealData.companyId
        }
      };
    } else {
      console.error(`❌ Deal creation failed:`, result.data);
      return {
        success: false,
        error: result.data
      };
    }
  }

  console.error(`❌ Deal creation API call failed:`, result.error);
  return result;
}

export async function createBiginNote(dealId, noteData) {
  console.log(`📝 Creating note for deal ${dealId}: ${noteData.title}`);

  try {
    console.log(`🔍 [NOTE CREATION] Checking Notes module field requirements...`);
    const notesFields = await getBiginModuleFields('Notes');
    if (notesFields.success) {
      const requiredFields = notesFields.fields.filter(f => f.required);
    console.log(`🔍 [NOTE CREATION] Required fields for Notes:`, requiredFields.map(f => ({
      apiName: f.apiName,
      required: f.required,
      dataType: f.data_type,
      writable: f.writable
    })));
  }
} catch (e) {
  console.log(`⚠️ [NOTE CREATION] Could not fetch Notes fields:`, e.message);
}

  const payload = {
    data: [{
      Note_Title: noteData.title || 'EnviroMaster Agreement Update',
      Note_Content: noteData.content,
      Parent_Id: dealId,
      $se_module: 'Deals',
    }]
  };

  console.log(`🔍 [NOTE CREATION] Payload:`, JSON.stringify(payload, null, 2));

  const endpoint = `/Notes`;
  console.log(`🔍 [NOTE CREATION] Using v2 Notes endpoint: ${endpoint}`);

  const result = await makeBiginRequest('POST', endpoint, payload);
  const errorPayload = result.error ? JSON.stringify(result.error, null, 2) : 'None';
  console.log(`🔍 [NOTE CREATION] Zoho response status:`, result.status, 'error:', errorPayload);
  console.log(`🔍 [NOTE CREATION] Zoho response payload:`, JSON.stringify(result.data, null, 2));
  const detailedError = result.error?.data?.[0]?.details || result.error?.details;
  if (detailedError) {
    console.log(`🔍 [NOTE CREATION] Zoho error detail payload:`, JSON.stringify(detailedError, null, 2));
  }

  if (result.success) {
    const createdNote = result.data?.data?.[0];
    console.log(`🔍 [NOTE CREATION] Full Zoho response:`, JSON.stringify(result.data, null, 2));

    if (createdNote?.code === 'SUCCESS') {
      console.log(`✅ Note created successfully: ${createdNote.details.id}`);

      return {
        success: true,
        note: {
          id: createdNote.details.id,
          title: noteData.title,
          content: noteData.content,
          dealId: dealId
        }
      };
    } else {
      console.error(`❌ Note creation failed:`, result.data);

      const zohoError = result.data?.data?.[0];
      const errorMessage = zohoError?.message || zohoError?.details || 'Unknown Zoho error';

      console.error(`❌ Extracted error message:`, errorMessage);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  console.error(`❌ Note creation API call failed:`, result.error);

  const errorMessage = result.error?.message || result.error || 'Unknown API error';

  return {
    success: false,
    error: errorMessage
  };
}

export async function createBiginTask(companyId, taskData) {
  console.log(`✅ Creating task for company ${companyId}: ${taskData.subject}`);

  const record = {
    Subject: taskData.subject,
    Status: taskData.status || 'Not Started',
    Priority: taskData.priority || 'Medium',
    $se_module: taskData.seModule || 'Accounts',
    What_Id: companyId,
  };

  if (taskData.dueDate) record.Due_Date = taskData.dueDate;
  if (taskData.description?.trim()) record.Description = taskData.description.trim();

  // Set Remind_At based on when option + time
  if (taskData.reminder && taskData.dueDate) {
    const [year, month, day] = taskData.dueDate.split('-').map(Number);
    const base = new Date(year, month - 1, day);
    const when = taskData.reminderWhen || 'On due date';
    if (when === 'A day before due date') base.setDate(base.getDate() - 1);
    else if (when === '2 days before due date') base.setDate(base.getDate() - 2);
    const remindDateStr = base.toISOString().split('T')[0];
    const time = taskData.reminderTime || '08:00';
    record.Remind_At = `${remindDateStr}T${time}:00+00:00`;
  } else if (taskData.reminder) {
    // No due date — remind tomorrow at specified time
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const time = taskData.reminderTime || '08:00';
    record.Remind_At = `${tomorrow}T${time}:00+00:00`;
  }

  // Try owner as plain string ID first (Bigin v2 sometimes needs this format)
  if (taskData.ownerId) record.Owner = taskData.ownerId;

  const payload = { data: [record] };

  console.log(`🔍 [TASK CREATION] Payload:`, JSON.stringify(payload, null, 2));

  let result = await makeBiginRequest('POST', '/Tasks', payload);
  console.log(`🔍 [TASK CREATION] Response status:`, result.status, 'error:', result.error ? JSON.stringify(result.error) : 'None');

  // If owner caused the error, retry without it
  if (!result.success && result.status === 400 && taskData.ownerId) {
    const ownerError = JSON.stringify(result.error || '');
    if (ownerError.includes('Owner')) {
      console.log(`⚠️ [TASK CREATION] Owner ID rejected, retrying without Owner field...`);
      delete record.Owner;
      result = await makeBiginRequest('POST', '/Tasks', { data: [record] });
      console.log(`🔍 [TASK CREATION] Retry status:`, result.status, 'error:', result.error ? JSON.stringify(result.error) : 'None');
    }
  }

  if (result.success) {
    const createdTask = result.data?.data?.[0];
    if (createdTask?.code === 'SUCCESS') {
      console.log(`✅ Task created successfully: ${createdTask.details.id}`);
      return {
        success: true,
        task: {
          id: createdTask.details.id,
          subject: taskData.subject,
          dueDate: taskData.dueDate,
          status: taskData.status || 'Not Started',
          priority: taskData.priority || 'Medium',
        }
      };
    }
    const zohoError = result.data?.data?.[0];
    const errorMessage = zohoError?.message || zohoError?.details || 'Unknown Zoho error';
    console.error(`❌ Task creation failed:`, errorMessage);
    return { success: false, error: errorMessage };
  }

  const errorMessage = result.error?.message || result.error || 'Unknown API error';
  console.error(`❌ Task creation API call failed:`, errorMessage);
  return { success: false, error: errorMessage };
}

export async function uploadBiginFile(dealId, pdfBuffer, fileName, options = {}) {
  const contentType = options.contentType || "application/pdf";
  console.log(`📎 Uploading file to deal ${dealId}: ${fileName} (${pdfBuffer.length} bytes, contentType=${contentType})`);

  try {
    const accessToken = await getZohoAccessToken();
    const baseUrl = getBiginBaseUrl();

    const sanitizedFileName = fileName;

    const formData = new FormData();
    formData.append('file', pdfBuffer, {
      filename: sanitizedFileName,
      contentType,
      knownLength: pdfBuffer.length
    });

    const uploadUrl = `${baseUrl}/Pipelines/${dealId}/Attachments`;
    console.log(`🔍 [FILE UPLOAD] URL: ${uploadUrl}`);
    console.log(`🔍 [FILE UPLOAD] File metadata:`, {
      originalFileName: fileName,
      sanitizedFileName,
      bufferLength: pdfBuffer.length,
      contentType,
      isBuffer: Buffer.isBuffer(pdfBuffer)
    });

    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': formData.getHeaders()['content-type']
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log(`🔍 [FILE UPLOAD] Full Zoho response:`, JSON.stringify(response.data, null, 2));

    if (response.data?.data?.[0]?.code === 'SUCCESS') {
      const fileData = response.data.data[0].details;
      console.log(`✅ File uploaded successfully to deal: ${fileData.id}`);

      return {
        success: true,
        file: {
          id: fileData.id,
          fileName: fileName,
          dealId: dealId,
          uploadedAt: new Date().toISOString()
        }
      };
    } else {
      console.error(`❌ File upload failed - unexpected response format:`, response.data);
      return {
        success: false,
        error: {
          message: 'Unexpected response format from Zoho',
          zohoResponse: response.data
        }
      };
    }

  } catch (error) {
    console.error(`❌ File upload error:`, error.response?.data || error.message);
    console.error(`❌ Full error object:`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers
    });

    return {
      success: false,
      error: {
        message: error.message,
        status: error.response?.status,
        zohoResponse: error.response?.data
      }
    };
  }
}

export async function getBiginModules() {
  console.log(`📋 Fetching available Bigin modules...`);

  const result = await makeBiginRequest('GET', '/settings/modules');

  if (result.success) {
    const modules = result.data?.modules || [];
    console.log(`✅ Found ${modules.length} modules`);
    return {
      success: true,
      modules: modules.map(module => ({
        apiName: module.api_name,
        displayLabel: module.display_label,
        creatable: module.creatable,
        editable: module.editable
      }))
    };
  }

  return result;
}

export async function getBiginModuleFields(moduleName) {
  console.log(`📋 Fetching field metadata for ${moduleName} module...`);

  const result = await makeBiginRequest('GET', `/settings/fields?module=${moduleName}`);

  console.log(`🔍 [DEBUG] Module fields request for ${moduleName}:`);
  console.log(`  ├ Success: ${result.success}`);
  console.log(`  ├ Status: ${result.status}`);
  console.log(`  ├ Data keys: ${result.data ? Object.keys(result.data) : 'No data'}`);
  console.log(`  └ Error: ${result.error || 'None'}`);

  if (result.success) {
    const fields = result.data?.fields || [];
    console.log(`✅ Found ${fields.length} fields for ${moduleName}`);
    if (fields.length > 0) {
      console.log(`🔍 Sample fields: ${fields.slice(0, 5).map(f => f.api_name).join(', ')}`);
    }
    return {
      success: true,
      moduleName: moduleName,
      fields: fields.map(field => ({
        apiName: field.api_name,
        displayLabel: field.display_label,
        dataType: field.data_type,
        required: field.required,
        readOnly: field.read_only,
        pickListValues: field.pick_list_values || null
      }))
    };
  }

  console.error(`❌ Failed to get ${moduleName} fields:`, result);
  return result;
}

export async function getBiginPipelines() {
  console.log(`📋 Fetching available Bigin pipelines with IDs...`);

  const endpoints = [
    '/settings/pipelines',
    '/Pipelines',
    '/settings/layouts?module=Deals'
  ];

  for (const endpoint of endpoints) {
    try {
      const result = await makeBiginRequest('GET', endpoint);
      if (result.success && result.data) {
        console.log(`✅ Found pipelines data from ${endpoint}:`, JSON.stringify(result.data, null, 2));
        return {
          success: true,
          pipelines: result.data.pipelines || result.data.data || result.data.layouts || []
        };
      }
    } catch (error) {
      console.log(`⚠️ Pipeline endpoint ${endpoint} failed: ${error.message}`);
    }
  }

  console.log(`⚠️ Could not fetch pipeline IDs - using fallback`);
  return {
    success: false,
    pipelines: []
  };
}
export async function getBiginPipelineStages() {
  console.log(`🔍 Fetching pipeline and stage options from Bigin...`);

  try {
    console.log(`🔍 Trying to fetch fields from 'Deals' module first...`);
    let fieldsResult = await getBiginModuleFields('Deals');

    if (!fieldsResult.success) {
      console.log(`🔄 'Deals' failed, trying 'Pipelines' module...`);
      fieldsResult = await getBiginModuleFields('Pipelines');
    }

    if (!fieldsResult.success) {
      console.log(`🔄 Both modules failed, trying 'Potentials' module...`);
      fieldsResult = await getBiginModuleFields('Potentials');
    }

    if (!fieldsResult.success) {
      return {
        success: false,
        error: 'Failed to fetch field metadata from any module (Deals, Pipelines, Potentials)'
      };
    }

    const fields = fieldsResult.fields;

    console.log(`🔍 [DEBUG] Available fields in module (${fieldsResult.moduleName || 'unknown'}):`, fields.map(f => f.apiName).slice(0, 15));

    console.log(`🔍 [DEBUG] Looking for pipeline fields: Sub_Pipeline, Pipeline, Pipeline_Name`);
    console.log(`🔍 [DEBUG] Looking for stage fields: Stage, Stage_Name`);

    const pipelineField = fields.find(f =>
      f.apiName === 'Sub_Pipeline' ||
      f.apiName === 'Pipeline' ||
      f.apiName === 'Pipeline_Name'
    );
    const stageField = fields.find(f =>
      f.apiName === 'Stage' ||
      f.apiName === 'Stage_Name'
    );

    console.log(`🔍 [DEBUG] Pipeline field found:`, pipelineField?.apiName, 'with', pipelineField?.pickListValues?.length || 0, 'values');
    console.log(`🔍 [DEBUG] Stage field found:`, stageField?.apiName, 'with', stageField?.pickListValues?.length || 0, 'values');

    const pipelineValues = pipelineField?.pickListValues;
    const pipelines = (pipelineValues && pipelineValues.length > 0) ? pipelineValues : [
      { display_value: 'Sales Pipeline Standard', actual_value: 'Sales Pipeline Standard' }
    ];

    console.log(`🔍 [DEBUG] Using pipelines:`, pipelines.map(p => p.display_value || p.actual_value));

    const stages = stageField?.pickListValues || [
      { display_value: 'Qualification', actual_value: 'Qualification' },
      { display_value: 'Needs Analysis', actual_value: 'Needs Analysis' },
      { display_value: 'Proposal/Price Quote', actual_value: 'Proposal/Price Quote' },
      { display_value: 'Negotiation/Review', actual_value: 'Negotiation/Review' },
      { display_value: 'Closed Won', actual_value: 'Closed Won' },
      { display_value: 'Closed Lost', actual_value: 'Closed Lost' }
    ];

    console.log(`✅ Found ${pipelines.length} pipelines and ${stages.length} stages`);
    console.log(`🔍 Pipelines:`, pipelines.map(p => p.display_value));
    console.log(`🔍 Stages:`, stages.map(s => s.display_value));

    return {
      success: true,
      pipelines: pipelines.map(p => ({
        label: p.display_value,
        value: p.actual_value || p.display_value
      })),
      stages: stages.map(s => ({
        label: s.display_value,
        value: s.actual_value || s.display_value
      }))
    };

  } catch (error) {
    console.error(`❌ Failed to fetch pipeline/stage options:`, error.message);
    return {
      success: false,
      error: error.message,
      pipelines: [
        { label: 'Sales Pipeline Standard', value: 'Sales Pipeline Standard' }
      ],
      stages: [
        { label: 'Qualification', value: 'Qualification' },
        { label: 'Needs Analysis', value: 'Needs Analysis' },
        { label: 'Proposal/Price Quote', value: 'Proposal/Price Quote' },
        { label: 'Negotiation/Review', value: 'Negotiation/Review' },
        { label: 'Closed Won', value: 'Closed Won' },
        { label: 'Closed Lost', value: 'Closed Lost' }
      ]
    };
  }
}

export async function validatePipelineStage(pipelineName, stageName) {
  console.log(`🔍 Validating pipeline: "${pipelineName}", stage: "${stageName}"`);

  try {
    const pipelineStages = await getBiginPipelineStages();

    if (!pipelineStages.success) {
      console.log(`⚠️ Could not validate against Zoho, allowing values`);
      return {
        success: true,
        valid: true,
        correctedPipeline: pipelineName,
        correctedStage: stageName,
        note: 'Validation skipped - could not fetch Zoho field options'
      };
    }

    const validPipelines = pipelineStages.pipelines;
    const validStages = pipelineStages.stages;

    const matchingPipeline = validPipelines.find(p =>
      p.value === pipelineName || p.label.toLowerCase() === pipelineName.toLowerCase()
    );

    const matchingStage = validStages.find(s =>
      s.value === stageName || s.label.toLowerCase() === stageName.toLowerCase()
    );

    if (!matchingPipeline) {
      console.log(`❌ Invalid pipeline: "${pipelineName}". Valid options:`, validPipelines.map(p => p.label));
      return {
        success: false,
        valid: false,
        error: `Invalid pipeline "${pipelineName}"`,
        validPipelines: validPipelines,
        validStages: validStages
      };
    }

    if (!matchingStage) {
      console.log(`❌ Invalid stage: "${stageName}". Valid options:`, validStages.map(s => s.label));
      return {
        success: false,
        valid: false,
        error: `Invalid stage "${stageName}"`,
        validPipelines: validPipelines,
        validStages: validStages,
        correctedPipeline: pipelineName,
        correctedStage: 'Proposal/Price Quote'
      };
    }

    console.log(`✅ Pipeline and stage are valid`);
    return {
      success: true,
      valid: true,
      correctedPipeline: matchingPipeline.value,
      correctedStage: matchingStage.value
    };

  } catch (error) {
    console.error(`❌ Pipeline/stage validation error:`, error.message);
    return {
      success: true,
      valid: true,
      correctedPipeline: pipelineName,
      correctedStage: stageName,
      note: `Validation error: ${error.message}`
    };
  }
}
