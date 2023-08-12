import { addTags } from "@/app/supabase-server";
import posthog from "posthog-js";

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

const llm = async (message: string) => {
  const response = await fetch('https://api.anthropic.com/v1/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!
    },
    body: JSON.stringify({
      prompt: message,
      model: 'claude-instant-1.2', // 'claude-2',
      max_tokens_to_sample: 5,
      stream: false
    })
  })
  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status} ${response.statusText}`)
  }
  const data = await response.json()
  return data.completion
}

const isATag = async (message: string) => {

  // try to guess if it seems to be a add tag request using a llm, if yes, add the tag 
  const prompt = `Human: You are an AI assistant that receive message through Whatsapp by users.
      The product that is integrated with WhatsApp is called Mediar, insights about your brain.
      Basically people wear a device that record their brain activity and send tags to you regarding the things they do,
      or experience during the day or their life, on the go, for example: "just ate an apple", or "just had a fight with my wife", or "im sad", or "so low energy tday..".
      The goal is to have a better understanding of the brain and how it works, and how to improve it.
      Your only job is to determine if the message sent by the user is a tag or another request.
      
      Other examples:
      - coffee
      - workout 1 hour ago
      - no sun today
      - poor sleep
      
      Counter examples:
      - https://www.youtube.com/watch?v=1qN72LEQnaU
      - https://imgur.com/gallery/1qN72LEQnaU
      - image.jpg
      
      (atm you can only deal with sentences, not images or videos)
      
      YOU ONLY ANSWER 1 (it's a tag) or 0 (it's not a tag).
      
      This is the message sent by the user: "${message}".
      
      Assistant:`

  const response = await llm(prompt)
  const isATag = response.trim().includes('1')

  return isATag
}

export async function POST(req: Request) {
  const body = await req.text();
  const params = new URLSearchParams(body);
  // @ts-ignore
  const parsed = Object.fromEntries(params) as IncomingRequest;
  posthog.capture('whatsapp message received', {
    from: parsed.From,
  });
  try {
    console.log(`Message from ${parsed.ProfileName}: ${parsed.Body}`);

    const isATagResponse = await isATag(parsed.Body)

    if (isATagResponse) {
      await addTags(parsed.From, parsed.Body)
      return new Response('Just added a tag to your brain. Your 🧠 is so beautiful ❤️!')
    }

    return new Response(`My sole purpose at the moment is to associate tags related to what is happening in your life to your brain activity.
You can send me messages like "just ate an apple", or "just had a fight with my wife", or "im sad", or "so low energy tday..".
This way I will better understand your brain and how it works, and give you better insights about it.
Your 🧠 is so beautiful ❤️!`)
  } catch (error) {
    console.log(error);
    return new Response(
      'Webhook handler failed. View your nextjs function logs.',
      {
        status: 400
      }
    );
  }
}

