// src/pages/api/webhooks/stripe.ts
import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import PocketBase from 'pocketbase';

export const prerender = false;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const POST: APIRoute = async ({ request }) => {
    const signature = request.headers.get('stripe-signature');
    const body = await request.text(); 

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature || '', endpointSecret || '');
    } catch (err: any) {
        console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        
        const userId = session.client_reference_id; 
        const purchasedModule = session.metadata?.module; 

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId && purchasedModule) {
            try {
                const pbUrl = process.env.PUBLIC_POCKETBASE_URL || "http://pocketbase:8080";
                const pb = new PocketBase(pbUrl);
                
                await pb.collection('_superusers').authWithPassword(
                    process.env.PB_ADMIN_EMAIL!, 
                    process.env.PB_ADMIN_PASSWORD!
                );

                const userRecord = await pb.collection('users').getOne(userId);
                let currentModules: string[] = userRecord.active_modules || [];
                
                // 👇 NEW: Determine the correct plan_type based on what they bought
                let newPlanType = 'pro'; 

                if (purchasedModule === 'all-in-one') {
                    currentModules = ['chat', 'extract', 'daas', 'knowledgebase', 'hosting'];
                    newPlanType = 'all-in-one';
                } else if (purchasedModule === 'doc_pro') {
                    if (!currentModules.includes('chat')) currentModules.push('chat');
                    if (!currentModules.includes('extract')) currentModules.push('extract');
                } else if (!currentModules.includes(purchasedModule)) {
                    currentModules.push(purchasedModule);
                }

                // 👇 FIXED: Now pushing plan_type and subscription_status to the database!
                await pb.collection('users').update(userId, {
                    active_modules: currentModules,
                    plan_type: newPlanType,
                    subscription_status: 'active',
                    stripe_customer_id: customerId,
                    stripe_subscription_id: subscriptionId,
                });

                console.log(`✅ Successfully added module '${purchasedModule}' and set plan to '${newPlanType}' for User ${userId}.`);
            } catch (pbError: any) {
                console.error(`❌ PocketBase Update Error:`, pbError.message);
                return new Response("Database update failed", { status: 500 });
            }
        }
    }

    // 🔴 ADDED: Handle cancellations automatically!
    if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        try {
            const pbUrl = process.env.PUBLIC_POCKETBASE_URL || "http://pocketbase:8080";
            const pb = new PocketBase(pbUrl);
            
            await pb.collection('_superusers').authWithPassword(
                process.env.PB_ADMIN_EMAIL!, 
                process.env.PB_ADMIN_PASSWORD!
            );

            // Find the user by their Stripe Customer ID
            const records = await pb.collection('users').getFullList({
                filter: `stripe_customer_id="${customerId}"`,
            });

            if (records.length > 0) {
                const user = records[0];
                
                // Revert them to free tier and strip premium modules
                await pb.collection('users').update(user.id, {
                    plan_type: 'free',
                    subscription_status: 'cancelled',
                    active_modules: [], // Wipes premium access
                });
                console.log(`📉 Subscription cancelled. User ${user.email} downgraded to free.`);
            }
        } catch (pbError: any) {
            console.error(`❌ PocketBase Cancellation Error:`, pbError.message);
        }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
};