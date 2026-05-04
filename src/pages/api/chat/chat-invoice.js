// Use the default import or the named import based on the version
import Groq from 'groq';

export const prerender = false; // Critical for API routes in Astro

const client = new Groq({
    apiKey: import.meta.env.GROQ_API_KEY, // Use import.meta.env for Astro
});

export async function POST({ request, locals }) {
    try {
        const { question, invoiceData } = await request.json();

        // Ensure we have an API key before proceeding
        if (!import.meta.env.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY is missing from environment variables.");
        }

        const completion = await client.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are an expert invoice auditor. Use the following extracted data to answer questions.
                    Invoice Data: ${JSON.stringify(invoiceData)}`
                },
                { role: "user", content: question }
            ],
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            temperature: 0.1,
        });

        return new Response(JSON.stringify({
            answer: completion.choices[0].message.content
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        console.error("Chat API Error:", e.message);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}