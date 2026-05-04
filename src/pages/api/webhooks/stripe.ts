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
        
        // This is the tenantId you passed in create-checkout.ts!
        const tenantId = session.client_reference_id; 
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (tenantId) {
            try {
                // 4. Initialize PocketBase as an Admin (since Stripe is making this request, not the user)
                const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);
                
                // Add these to your .env file
                await pb.admins.authWithPassword(
                    process.env.PB_ADMIN_EMAIL!, 
                    process.env.PB_ADMIN_PASSWORD!
                );

                // 5. Upgrade the specific tenant in PocketBase
                await pb.collection('tenants').update(tenantId, {
                    plan_type: 'pro',
                    subscription_status: 'active',
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId,
                });

                console.log(`✅ Successfully upgraded tenant ${tenantId} to Pro.`);
            } catch (pbError) {
                console.error(`❌ PocketBase Update Error:`, pbError);
                return new Response("Database update failed", { status: 500 });
            }
        }
    }

    // Acknowledge receipt to Stripe so it doesn't keep retrying
    return new Response(JSON.stringify({ received: true }), { status: 200 });
};