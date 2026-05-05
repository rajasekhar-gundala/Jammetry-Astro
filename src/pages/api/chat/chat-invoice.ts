import type { APIRoute } from 'astro';

export const prerender = false; 

export const POST: APIRoute = async ({ request, locals }) => {
    // 1. SECURITY: Block unauthenticated users immediately
    if (!locals.user) {
        return new Response(JSON.stringify({ error: "Unauthorized. Please log in." }), { 
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const user = locals.user;
        const userModules = user.active_modules || [];
        const legacyContext = user.app_context || '';

        // 2. FAIR USE POLICY (FUP) CHECK
        // Check if they have the Doc & Data Pro module ('extract' / 'chat') or All-in-One
        const isPro = userModules.includes('all-in-one') || 
                      userModules.includes('extract') || 
                      legacyContext === 'all-in-one';

        // 10,000 queries for Pro (Soft Cap), 20 queries for Free/Starter
        const messageLimit = isPro ? 10000 : 20; 
        const currentUsage = user.monthly_ai_messages || 0;

        if (currentUsage >= messageLimit) {
            return new Response(JSON.stringify({ 
                error: "Monthly AI message limit reached. Please upgrade your plan to continue." 
            }), { 
                status: 429, // 429 Too Many Requests
                headers: { "Content-Type": "application/json" } 
            });
        }

        // 3. Parse Request
        const { question, invoiceData } = await request.json();

        if (!question || !invoiceData) {
            return new Response(JSON.stringify({ error: "Missing question or invoice data." }), { status: 400 });
        }

        // 4. GENERATE AI RESPONSE (Directly hitting your local AI Engine!)
        // This perfectly matches how your Node.js backend communicates with it.
        const aiResponse = await fetch("http://ai-engine:8080/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Required by the OpenAI spec, even if your local engine ignores it
                "Authorization": "Bearer local-dev" 
            },
            body: JSON.stringify({
                model: "core-ai", // Matching the model name from your index.js
                messages: [
                    {
                        role: "system",
                        content: `You are an expert invoice auditor. Use the following extracted data to answer the user's questions concisely and accurately.\n\nInvoice Data: ${JSON.stringify(invoiceData)}`
                    },
                    { role: "user", content: question }
                ],
                temperature: 0.1,
            })
        });

        if (!aiResponse.ok) {
            const errText = await aiResponse.text();
            throw new Error(`AI Engine rejected request: ${errText}`);
        }

        const completion = await aiResponse.json();
        const answer = completion.choices[0]?.message?.content || "I couldn't generate an answer.";

        // 5. UPDATE USAGE TRACKER IN POCKETBASE
        try {
            // Increment the user's monthly message count by 1
            await locals.pb.collection('users').update(user.id, {
                "monthly_ai_messages+": 1 
            });
        } catch (dbError) {
            console.error("⚠️ Failed to update usage counter:", dbError);
        }

        // 6. Return the answer to the frontend UI
        return new Response(JSON.stringify({ answer }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (e: any) {
        console.error("❌ Chat API Error:", e.message);
        return new Response(JSON.stringify({ error: "An error occurred while communicating with the local AI engine." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};