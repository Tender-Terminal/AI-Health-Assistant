import { sendWhatsAppMessage } from "@/app/whatsapp-server";
import { Database } from "@/types_db";
import { createClient } from "@supabase/supabase-js";
import { kv } from '@vercel/kv';
import fetch from 'node-fetch';
import { HfInference } from "@huggingface/inference";
import { baseMediarAI, buildBothDataPrompt, buildOnlyNeurosityPrompt, buildOnlyOuraRingPrompt, generalMediarAIInstructions } from "@/lib/utils";


// export const runtime = 'edge'
export const maxDuration = 300


const quotes = [
  "✨ Small daily improvements add up to big results over time. Keep logging your health data with Mediar!",

  "💫 The journey of a thousand miles begins with a single step. Start optimizing your wellbeing today!",

  "🌼 Your health data is beautiful and unique. Mediar will help you understand your patterns better.",

  "💯 Progress requires patience. Stick with tracking your health, you've got this!",

  "🤝 Mediar is here to help you unlock your best self. We're in this together!",

  "🌻 Wellbeing takes work, but it's worth it. Keep striving for health!",

  "🙌 The body and mind achieve what they believe. Believe in yourself and your health goals!"
]

// Define the type for the incoming request
interface IncomingRequest {
  SmsMessageSid: string;
  NumMedia: number;
  ProfileName: string;
  SmsSid: string;
  WaId: string;
  SmsStatus: string;
  Body: string;
  To: string;
  NumSegments: number;
  ReferralNumMedia: number;
  MessageSid: string;
  AccountSid: string;
  From: string;
  ApiVersion: string;
}


const isTagOrQuestion = async (message: string) => {

  const prompt = `Human: ${baseMediarAI}

Your task is to classify the following message into one of the following categories:

YOU ONLY ANSWER:
- 3 if it's a feedback
- 2 if it's a tag 
- 1 if it's a question
- 0 otherwise

Feedback examples:
- i would rather have weekly insights
- i dont like advices
- you are awesome

Tag examples: 
- coffee
- workout 1 hour ago
- no sun today
- poor sleep

Question examples:
- What is my average heart rate last week?
- How can I improve my sleep?

This is the message sent by the user: "${message}"

Assistant:`

  const response = await llm(prompt, 3, 'claude-instant-1.2', 10)

  if (response.trim().includes('3')) {
    return 'feedback'
  } else if (response.trim().includes('2')) {
    return 'tag'
  } else if (response.trim().includes('1')) {
    return 'question'
  } else {
    return 'none'
  }
}

const track = async (userId: string) => {
  await fetch(
    'https://app.posthog.com/capture/',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: 'phc_V7co1flWmfnd9Hd6LSyPRau9sARsxMEiOrmNvGeUhbJ',
        event: 'whatsapp message received',
        distinct_id: userId,
      }),
    }
  )
}
const QUESTION_PREFIX = 'question_';
const TAG_PREFIX = 'tag_';

export async function POST(req: Request) {
  const body = await req.text();
  const params = new URLSearchParams(body);
  const parsed = Object.fromEntries(params) as any;
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  )

  console.log(parsed);
  const phoneNumber = parsed.From.replace('whatsapp:', '')
  // get userId
  const { data, error } = await supabase.from('users').select().eq('phone', phoneNumber).limit(1);
  if (error || !data || data.length === 0) {
    console.log(error, data)
    return new Response(`Error fetching user or user not found. Error: ${error?.message}`, { status: 400 });

  }
  const userId = data[0].id
  const phoneVerified = data[0].phone_verified || false
  await track(userId)
  if (!phoneVerified) {
    return new Response(`Your phone has not been verified!`);
  }

  const date = new Date().toLocaleDateString('en-US', { timeZone: data[0].timezone });
  const questionKey = QUESTION_PREFIX + userId + '_' + date;
  const tagKey = TAG_PREFIX + userId + '_' + date;

  console.log("Question key:", questionKey, "Tag key:", tagKey);
  const questionCount = await kv.get(questionKey);
  const tagCount = await kv.get(tagKey);
  console.log("Question count:", questionCount, "Tag count:", tagCount);

  const hasImage = parsed.NumMedia > 0;
  if (hasImage) {
    const msg = "Sure, give me a few seconds to understand your image 🙏."
    await sendWhatsAppMessage(phoneNumber, msg)

    await kv.incr(tagKey);
    console.log("Image received, sending to inference API");

    const urlContentToDataUri = async (url: string) => {
      const response = await fetch(url);
      const buffer = await response.buffer();
      const base64 = buffer.toString('base64');
      return base64;
    };
    await supabase.from('chats').insert({
      text: JSON.stringify(parsed.MediaUrl0),
      user_id: userId,
      category: 'tag',
      channel: 'whatsapp'
    });
    const b64Image = await urlContentToDataUri(parsed.MediaUrl0);
    const [elementsCaption, actionCaption, textCaption]: string[] = await Promise.all([
      getCaption('list each element in the image', b64Image),
      getCaption('what is the person doing?', b64Image),
      opticalCharacterRecognition(b64Image)
    ]);
    let captions = []

    // if detected caption is not "unanswerable", add it to the caption
    // `elements: ${elementsCaption}, action: ${actionCaption}, text: ${textCaption}`;
    if (elementsCaption !== 'unanswerable') {
      captions.push('elements: ' + elementsCaption)
    }
    if (actionCaption !== 'unanswerable') {
      captions.push('action: ' + actionCaption)
    }
    if (textCaption.length > 3) {
      const escapeMarkdown = (text: string) => {
        const specialChars = ['*', '_', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
        return text.split('').map(char => specialChars.includes(char) ? '\\' + char : char).join('');
      }
      const sanitizedText = escapeMarkdown(textCaption);
      captions.push('text: ' + sanitizedText)
    }
    const llmAugmented = await llm(`Human:
Based on these captions created by an AI from a image message sent by a user for a health app,
what is the most likely tag for this image? Is it food? Is it a workout? Is it a sleep event?
How many calories do you think this meal has? Try to augment these captions generated by VQA model.

Captions:${JSON.stringify([elementsCaption, actionCaption, textCaption])}

ONLY ANSWER A VERY CONCISE TAG, NOTHING ELSE, EXAMPLES:
- seems to be an apple, 100 calories
- seems to be a workout, deadlift, 110 kg, 5 reps
- seems to be a sleep event, 8 hours, 2 hours deep sleep, 1 hour rem sleep
    
    Assistant:`, 3, 'claude-instant-1.2', 100)
        captions.push('agi: ' + llmAugmented)
    
    const caption = captions.join('\n')
    // list each element in the image
    // what is the person doing?
    console.log("Caption:", caption);

    // Insert as tag
    const { data: d2, error: e2 } = await supabase.from('tags').insert({
      text: caption,
      user_id: userId
    });

    console.log("Tag added:", d2, e2);

    const msg2 = `I see in your image "${caption}". I've recorded that tag for you and associated this to your health data.
Feel free to send me more images and I'll try to understand them! Any feedback appreciated ❤️!
${quotes[Math.floor(Math.random() * quotes.length)]}`
    return new Response(msg2);
  }
  try {
    console.log(`Message from ${parsed.ProfileName}: ${parsed.Body}`);

    const intent = await isTagOrQuestion(parsed.Body);
    if (intent === 'question') {
      await kv.incr(questionKey);
      const msg = "Sure, give me a few seconds to read your data and I'll get back to you with an answer in less than a minute 🙏. PS: Any feedback appreciated ❤️"
      await sendWhatsAppMessage(phoneNumber, msg)
      const prompt = await generatePromptForUser(userId, parsed.Body)
      console.log("Prompt:", prompt);
      const response = await llm(prompt, 3, 'claude-2', 500)
      console.log("Response:", response);
      const { data, error } = await supabase.from('chats').insert({
        text: response,
        user_id: userId,
        category: 'answer',
      });
      console.log("Chat added:", data, error);
      await sendWhatsAppMessage(phoneNumber, response)
      return new Response('');
    } else if (intent === 'tag') {
      await kv.incr(tagKey);
      const { data, error } = await supabase.from('tags').insert({
        text: parsed.Body,
        user_id: userId,
      });
      console.log("Tag added:", data, error);
      await supabase.from('chats').insert({
        text: parsed.Body,
        user_id: userId,
        category: 'tag',
        channel: 'whatsapp'
      });
      const msg = `Got it! I've recorded your tag. Keep sending me more tags it will help me understand you better.
By connecting your wearables like Oura or Neurosity, I can give you better insights about your mind and body.
            
${quotes[Math.floor(Math.random() * quotes.length)]}`

      return new Response(msg);
    } else if (intent === 'feedback') {
      // New code for feedback intent
      const { data, error } = await supabase.from('chats').insert({
        text: parsed.Body,
        user_id: userId,
        category: 'feedback',
        channel: 'whatsapp'
      });
      console.log("Feedback added:", data, error);
      const msg = `Thank you for your feedback! We appreciate your input and will use it to improve our service. Feel free to send us more feedback anytime!

${quotes[Math.floor(Math.random() * quotes.length)]}`
      return new Response(msg);
    }

    return new Response(`I'm sorry it seems you didn't ask a question neither tag an event from your life. My sole purpose at the moment is to associate tags related to what is happening in your life to your health data from your wearables.
You can send me messages like "just ate an apple", or "just had a fight with my wife", or "im sad", or "so low energy tday..".
This way I will better understand how your body works, and give you better insights about it. I can also answer questions like "how can i be more productive?" or "how can i improve my sleep?".

${quotes[Math.floor(Math.random() * quotes.length)]}`);
  } catch (error) {
    console.log(error);
    return new Response(
      'Webhook handler failed. View your nextjs function logs.',
      { status: 200 });
  }
}

async function generatePromptForUser(userId: string, question: string): Promise<string> {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  )

  // 1. Fetch the user's information
  const { error, data: users } = await supabase
    .from('users')
    .select('id, phone, timezone, full_name')
    .eq('id', userId);

  if (error || !users || users.length === 0) {
    throw new Error(`Error fetching user or user not found. Error: ${error?.message}`);
  }

  const user = users[0];

  // 2. Compute yesterday's date for the user
  const yesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toLocaleString('en-US', { timeZone: user.timezone });

  // 3. Retrieve Neurosity data for the user
  const { data } = await supabase
    .from('states')
    .select('created_at, probability')
    .eq('metadata->>label', 'focus')
    .eq('user_id', user.id)

    .gte('created_at', yesterday)
    .order('created_at', { ascending: false });

  // Group by 300 samples and average the probability
  const neuros = data
    // filter out < 0.3 probability
    ?.filter((item) => item.probability && item.probability! > 0.3)
    ?.reduce((acc: any, curr, index, array) => {
      if (index % 300 === 0) {
        const slice = array.slice(index, index + 300);
        const avgProbability = slice.reduce((sum, item) => sum + (item.probability || 0), 0) / slice.length;
        acc.push({ created_at: curr.created_at, probability: avgProbability });
      }
      return acc;
    }, []);


  // 4. Retrieve Oura data for the user
  const { data: ouras } = await supabase
    .from('states')
    .select()
    .gte('oura->>day', new Date(yesterday).toISOString().split('T')[0])
    .eq('user_id', user.id)
    .order('oura->>day', { ascending: false });

  // 5. Retrieve tags for the user
  const tags = await getTags(userId, yesterday);

  let tagsString = '';
  tags.forEach((tag) => {
    tag.created_at = new Date(tag.created_at!).toLocaleString('en-US', { timeZone: user.timezone });
    tagsString += JSON.stringify(tag);
  });

  let neurosString = '';
  neuros.forEach((neuro: any) => {
    neuro.created_at = new Date(neuro.created_at!).toLocaleString('en-US', { timeZone: user.timezone });
    neurosString += JSON.stringify(neuro);
  });

  let ourasString = '';
  ouras?.forEach((oura) => {
    oura.created_at = new Date(oura.created_at!).toLocaleString('en-US', { timeZone: user.timezone });
    ourasString += JSON.stringify(oura);
  });

  // 6. Construct the prompt based on available data
  let prompt = '';
  if (neuros && neuros.length > 0 && ouras && ouras.length > 0) {
    console.log("Both neuros and ouras data available");
    prompt = buildBothDataPrompt(neurosString, ourasString, tagsString, user, question);
  } else if (neuros && neuros.length > 0) {
    console.log("Only neuros data available");
    prompt = buildOnlyNeurosityPrompt(neurosString, tagsString, user, question);
  } else if (ouras && ouras.length > 0) {
    console.log("Only ouras data available");
    prompt = buildOnlyOuraRingPrompt(ourasString, tagsString, user, question);
  }

  return prompt;
}


const getTags = async (userId: string, date: string) => {
  console.log("Getting tags for user:", userId, "since date:", date);
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  )
  const { data, error } = await supabase
    .from('tags')
    .select('text, created_at')
    .eq('user_id', userId)
    .gt('created_at', date)

  if (error) {
    console.log("Error fetching tags:", error.message);
  }
  return data || [];
};



import { auth } from "google-auth-library";
import { opticalCharacterRecognition } from "@/lib/google-cloud";
import { llm } from "@/utils/llm";
const API_ENDPOINT = "us-central1-aiplatform.googleapis.com";
const URL = `https://${API_ENDPOINT}/v1/projects/mediar-394022/locations/us-central1/publishers/google/models/imagetext:predict`;

const getIdToken = async () => {
  const client = auth.fromJSON(JSON.parse(process.env.GOOGLE_SVC!));
  // @ts-ignore
  client.scopes = ["https://www.googleapis.com/auth/cloud-platform"];
  // @ts-ignore
  const idToken = await client.authorize();
  return idToken.access_token;
};

const getCaption = async (prompt: string, base64Image: string) => {
  const headers = {
    Authorization: `Bearer ` + (await getIdToken()),
    "Content-Type": "application/json",
  };

  const data = {
    instances: [
      {
        prompt,
        image: {
          bytesBase64Encoded: base64Image,
        },
      },
    ],
    parameters: {
      sampleCount: 1
    }
  }

  const response = await fetch(URL, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    console.error(response.statusText);
    throw new Error("Request failed " + response.statusText);
  }

  const result = await response.json();
  return result.predictions[0]
};