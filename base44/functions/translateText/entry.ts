import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Language names mapping
const LANGUAGE_NAMES = {
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'nl': 'Dutch',
  'zh': 'Chinese (Simplified)',
  'ja': 'Japanese',
  'ko': 'Korean',
  'ar': 'Arabic',
  'ru': 'Russian',
  'hi': 'Hindi',
  'pl': 'Polish',
  'tr': 'Turkish',
  'sv': 'Swedish',
  'da': 'Danish',
  'fi': 'Finnish',
  'no': 'Norwegian',
  'cs': 'Czech'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { text, targetLanguage } = await req.json();

    if (!text || !targetLanguage) {
      return Response.json({ error: 'Missing text or targetLanguage' }, { status: 400 });
    }

    // Don't translate if target is English
    if (targetLanguage === 'en') {
      return Response.json({ translated: text });
    }

    const languageName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    // Use LLM for translation
    const { data } = await base44.integrations.Core.InvokeLLM({
      prompt: `Translate the following English text to ${languageName}. Return ONLY the translation, no explanations or additional text:

"${text}"`,
      response_json_schema: {
        type: 'object',
        properties: {
          translation: { type: 'string' }
        },
        required: ['translation']
      }
    });

    const translated = data?.translation || text;

    return Response.json({ 
      translated,
      originalText: text,
      targetLanguage: languageName
    });

  } catch (error) {
    console.error('Translation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});