require('dotenv').config();
const axios = require('axios');

/**
 * Fetch basic user profile info and Person ID using OpenID userinfo endpoint.
 */
async function getUserProfile(accessToken) {
  const token = accessToken || process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    throw new Error('LINKEDIN_ACCESS_TOKEN is not set. Please authenticate first.');
  }

  try {
    const res = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = res.data;
    const personId = data.sub;
    const personUrn = `urn:li:person:${personId}`;

    return {
      personUrn,
      personId,
      name: data.name || `${data.given_name || ''} ${data.family_name || ''}`.trim(),
      email: data.email
    };
  } catch (err) {
    console.error('Failed to get userinfo:', err.response?.data || err.message);
    throw new Error(`Failed to fetch LinkedIn profile: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Upload an image buffer to LinkedIn Media Asset API.
 *
 * @param {Buffer} imageBuffer 
 * @param {string} accessToken 
 * @param {string} personUrn 
 * @returns {Promise<string>} assetUrn (e.g. urn:li:digitalmediaAsset:...)
 */
async function uploadLinkedInImage(imageBuffer, accessToken, personUrn) {
  const registerPayload = {
    registerUploadRequest: {
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      owner: personUrn,
      supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD']
    }
  };

  const registerRes = await axios.post(
    'https://api.linkedin.com/v2/assets?action=registerUpload',
    registerPayload,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const uploadMechanism = registerRes.data?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'];
  const uploadUrl = uploadMechanism?.uploadUrl;
  const assetUrn = registerRes.data?.value?.asset;

  if (!uploadUrl || !assetUrn) {
    throw new Error('LinkedIn image register upload did not return uploadUrl or asset URN.');
  }

  // Upload binary data
  await axios.put(uploadUrl, imageBuffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Authorization': `Bearer ${accessToken}`
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  console.log(`✅ Uploaded image asset to LinkedIn: ${assetUrn}`);
  return assetUrn;
}

/**
 * Publish a post to LinkedIn (supports text and attached image).
 *
 * @param {string} text - Content of the post
 * @param {Buffer | null} [imageBuffer=null] - Optional binary image buffer
 * @param {string} [accessToken] - Optional access token override
 * @param {string} [personUrn] - Optional person URN override
 * @returns {Promise<{ success: boolean, postId: string, postUrl: string }>}
 */
async function publishLinkedInPost(text, imageBuffer = null, accessToken, personUrn) {
  const token = accessToken || process.env.LINKEDIN_ACCESS_TOKEN;
  let urn = personUrn || process.env.LINKEDIN_PERSON_URN;

  if (!token) {
    throw new Error('LinkedIn Access Token missing! Please run "node auth.js" to authenticate.');
  }

  // If personUrn is not set, fetch it dynamically
  if (!urn) {
    console.log('LinkedIn Person URN missing, fetching via userinfo...');
    const profile = await getUserProfile(token);
    urn = profile.personUrn;
  }

  if (!urn.startsWith('urn:li:person:') && !urn.startsWith('urn:li:organization:')) {
    urn = `urn:li:person:${urn}`;
  }

  let assetUrn = null;
  if (imageBuffer && Buffer.isBuffer(imageBuffer)) {
    try {
      console.log('Uploading image to LinkedIn...');
      assetUrn = await uploadLinkedInImage(imageBuffer, token, urn);
    } catch (uploadErr) {
      console.warn('Image upload failed, publishing text-only post instead:', uploadErr.message);
    }
  }

  // Construct UGC Share Content
  const shareContent = {
    shareCommentary: {
      text: text
    },
    shareMediaCategory: assetUrn ? 'IMAGE' : 'NONE'
  };

  if (assetUrn) {
    shareContent.media = [
      {
        status: 'READY',
        description: {
          text: 'Visual insight'
        },
        media: assetUrn,
        title: {
          text: 'Visual'
        }
      }
    ];
  }

  const ugcPayload = {
    author: urn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': shareContent
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
    }
  };

  try {
    const res = await axios.post('https://api.linkedin.com/v2/ugcPosts', ugcPayload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json'
      }
    });

    const postId = res.data?.id || '';
    const postUrl = postId ? `https://www.linkedin.com/feed/update/${postId}/` : 'https://www.linkedin.com/feed/';

    return {
      success: true,
      postId,
      postUrl
    };
  } catch (err) {
    console.error('LinkedIn UGC publish error:', err.response?.data || err.message);
    const errMsg = err.response?.data?.message || err.message;
    throw new Error(`LinkedIn publishing failed: ${errMsg}`);
  }
}

module.exports = {
  getUserProfile,
  publishLinkedInPost,
  uploadLinkedInImage
};
