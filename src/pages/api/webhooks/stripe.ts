// src/pages/api/webhooks/stripe.ts
import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import PocketBase from 'pocketbase';

export const prerender = false;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
});

// You will get this secret from the Stripe Developer Dashboard under "Webhooks"
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const POST: APIRoute = async ({ request }) => {
    // 1. Get the raw body and signature (Required for Stripe security verification)
    const signature = request.headers.get('stripe-signature');
    const body = await request.text(); 

    let event: Stripe.Event;

    // 2. Verify the webhook was actually sent by Stripe
    try {
        event = stripe.webhooks.constructEvent(body, signature || '', endpointSecret || '');
    } catch (err: any) {
        console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // 3. Handle the successful payment event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // 👉 NEW: This is now the USER ID, not the Tenant ID!
        const userId = session.client_reference_id; 
        
        // 👉 NEW: Grab the specific module they purchased from the metadata we passed in checkout
        const purchasedModule = session.metadata?.module; 

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId && purchasedModule) {
            try {
                // 4. Initialize PocketBase as an Admin
                // Use the internal Docker URL if running in Docker, otherwise fallback to public URL
                const pbUrl = process.env.PUBLIC_POCKETBASE_URL || "http://pocketbase:8080";
                const pb = new PocketBase(pbUrl);
                
                // Authenticate as superuser to securely modify the user record
                await pb.collection('_superusers').authWithPassword(
                    process.env.PB_ADMIN_EMAIL!, 
                    process.env.PB_ADMIN_PASSWORD!
                );

                // 5. Fetch the user to get their current active_modules array
                const userRecord = await pb.collection('users').getOne(userId);
                let currentModules: string[] = userRecord.active_modules || [];

                // 6. Append the new module safely
                if (purchasedModule === 'all-in-one') {
                    // Unlock everything
                    currentModules = ['chat', 'extract', 'daas', 'knowledgebase', 'hosting'];
                } else if (!currentModules.includes(purchasedModule)) {
                    // Append the single module if they don't already have it
                    currentModules.push(purchasedModule);
                }

                // 7. Update the USER record in PocketBase
                await pb.collection('users').update(userId, {
                    active_modules: currentModules,
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId,
                });

                console.log(`✅ Successfully added module '${purchasedModule}' to User ${userId}.`);
            } catch (pbError: any) {
                console.error(`❌ PocketBase Update Error:`, pbError.message);
                return new Response("Database update failed", { status: 500 });
            }
        } else {
            console.warn("⚠️ Webhook missing userId or module metadata.");
        }
    }

    // Acknowledge receipt to Stripe so it doesn't keep retrying
    return new Response(JSON.stringify({ received: true }), { status: 200 });
};