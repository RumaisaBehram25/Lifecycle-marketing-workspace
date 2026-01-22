import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Comprehensive platform documentation topics - 35+ per platform
const PLATFORM_TOPICS: Record<string, Array<{ topic: string; category: string }>> = {
  braze: [
    // Liquid & Personalization
    { topic: 'Liquid templating syntax and examples', category: 'liquid_templating' },
    { topic: 'Liquid conditional logic if else unless', category: 'liquid_templating' },
    { topic: 'Liquid for loops and iterating arrays', category: 'liquid_templating' },
    { topic: 'Liquid filters and modifiers', category: 'liquid_templating' },
    { topic: 'Liquid date formatting and time zones', category: 'liquid_templating' },
    { topic: 'Connected Content API calls in templates', category: 'liquid_templating' },
    { topic: 'Personalization tags and default values', category: 'liquid_templating' },
    
    // Channels
    { topic: 'Email templates and design best practices', category: 'email' },
    { topic: 'Email deliverability and warming', category: 'email' },
    { topic: 'Push notification setup iOS Android', category: 'push_notifications' },
    { topic: 'Rich push notifications with images', category: 'push_notifications' },
    { topic: 'SMS MMS marketing setup', category: 'sms' },
    { topic: 'In-app messages and Content Cards', category: 'in_app' },
    
    // Flows & Campaigns
    { topic: 'Canvas flow builder setup', category: 'flows_journeys' },
    { topic: 'Canvas decision split and audience paths', category: 'flows_journeys' },
    { topic: 'Canvas timing and delays', category: 'flows_journeys' },
    { topic: 'Campaign setup and scheduling', category: 'flows_journeys' },
    { topic: 'A/B testing in Canvas and campaigns', category: 'testing' },
    { topic: 'Multivariate testing best practices', category: 'testing' },
    
    // Segmentation
    { topic: 'Segment builder and filters', category: 'segmentation' },
    { topic: 'Custom attributes and events', category: 'segmentation' },
    { topic: 'Cohort analysis and retention', category: 'segmentation' },
    
    // API & Integrations
    { topic: 'REST API endpoints overview', category: 'api_reference' },
    { topic: 'Webhooks and data export', category: 'api_reference' },
    { topic: 'Currents data streaming', category: 'integrations' },
    { topic: 'SDK integration iOS Android Web', category: 'integrations' },
    
    // Analytics
    { topic: 'Campaign analytics and reporting', category: 'analytics' },
    { topic: 'Engagement metrics and KPIs', category: 'analytics' },
    { topic: 'Revenue attribution', category: 'analytics' },
  ],
  
  klaviyo: [
    // Liquid & Personalization
    { topic: 'Django Liquid templating syntax', category: 'liquid_templating' },
    { topic: 'Conditional content if else endif', category: 'liquid_templating' },
    { topic: 'For loops and array iteration', category: 'liquid_templating' },
    { topic: 'Filters split join slice', category: 'liquid_templating' },
    { topic: 'Date and time formatting', category: 'liquid_templating' },
    { topic: 'Product blocks and catalog lookups', category: 'liquid_templating' },
    { topic: 'Dynamic content and personalization', category: 'liquid_templating' },
    { topic: 'Template variables and default values', category: 'liquid_templating' },
    
    // Flows
    { topic: 'Flow builder and automation setup', category: 'flows_journeys' },
    { topic: 'Abandoned cart flow complete setup', category: 'flows_journeys' },
    { topic: 'Browse abandonment flow', category: 'flows_journeys' },
    { topic: 'Welcome series flow', category: 'flows_journeys' },
    { topic: 'Post-purchase flow and winback', category: 'flows_journeys' },
    { topic: 'Sunset flow for inactive subscribers', category: 'flows_journeys' },
    { topic: 'Flow triggers and filters', category: 'flows_journeys' },
    { topic: 'Conditional splits in flows', category: 'flows_journeys' },
    { topic: 'Time delays and smart sending', category: 'flows_journeys' },
    
    // Channels
    { topic: 'Email template design', category: 'email' },
    { topic: 'SMS marketing setup and compliance', category: 'sms' },
    { topic: 'Push notifications mobile', category: 'push_notifications' },
    
    // Segmentation
    { topic: 'List management and segments', category: 'segmentation' },
    { topic: 'Predictive analytics and segments', category: 'segmentation' },
    { topic: 'Customer lifetime value CLV', category: 'segmentation' },
    { topic: 'RFM segmentation', category: 'segmentation' },
    
    // API & Integrations
    { topic: 'REST API v3 endpoints', category: 'api_reference' },
    { topic: 'Metrics and events API', category: 'api_reference' },
    { topic: 'Profiles API and custom properties', category: 'api_reference' },
    { topic: 'Shopify integration deep dive', category: 'integrations' },
    { topic: 'Webhooks outbound events', category: 'integrations' },
    
    // Testing & Analytics
    { topic: 'A/B testing flows and campaigns', category: 'testing' },
    { topic: 'Campaign analytics and benchmarks', category: 'analytics' },
    { topic: 'Deliverability and inbox placement', category: 'analytics' },
    { topic: 'Forms and signup optimization', category: 'acquisition' },
    { topic: 'Product recommendations AI', category: 'personalization' },
  ],
  
  iterable: [
    // Templates & Liquid
    { topic: 'Handlebars templating syntax', category: 'liquid_templating' },
    { topic: 'Conditional helpers if else', category: 'liquid_templating' },
    { topic: 'Each loops and iterations', category: 'liquid_templating' },
    { topic: 'Template personalization fields', category: 'liquid_templating' },
    { topic: 'Data feeds and lookups', category: 'liquid_templating' },
    
    // Workflows
    { topic: 'Workflow Studio automation builder', category: 'flows_journeys' },
    { topic: 'Journey triggers and entry criteria', category: 'flows_journeys' },
    { topic: 'Delay and wait steps', category: 'flows_journeys' },
    { topic: 'Split and filter nodes', category: 'flows_journeys' },
    { topic: 'Multi-channel workflows', category: 'flows_journeys' },
    
    // Channels
    { topic: 'Email templates and campaigns', category: 'email' },
    { topic: 'Push notifications iOS Android Web', category: 'push_notifications' },
    { topic: 'SMS messaging setup', category: 'sms' },
    { topic: 'In-app messaging', category: 'in_app' },
    { topic: 'Mobile inbox messages', category: 'in_app' },
    
    // Events & Data
    { topic: 'Events and user tracking', category: 'events_tracking' },
    { topic: 'User profile fields and custom fields', category: 'segmentation' },
    { topic: 'Lists and segments', category: 'segmentation' },
    { topic: 'Catalog and product data', category: 'data' },
    
    // API
    { topic: 'REST API reference', category: 'api_reference' },
    { topic: 'Webhooks integration', category: 'integrations' },
    { topic: 'SDK setup mobile web', category: 'integrations' },
    
    // Testing
    { topic: 'Experiments and A/B testing', category: 'testing' },
    { topic: 'Campaign analytics', category: 'analytics' },
  ],
  
  customerio: [
    // Liquid
    { topic: 'Liquid templating in Customer.io', category: 'liquid_templating' },
    { topic: 'Conditional content if else', category: 'liquid_templating' },
    { topic: 'For loops and collections', category: 'liquid_templating' },
    { topic: 'Filters and formatting', category: 'liquid_templating' },
    { topic: 'Trigger attributes in templates', category: 'liquid_templating' },
    
    // Journeys
    { topic: 'Journey builder campaigns', category: 'flows_journeys' },
    { topic: 'Triggered campaigns setup', category: 'flows_journeys' },
    { topic: 'Segment triggered campaigns', category: 'flows_journeys' },
    { topic: 'Delays and timing', category: 'flows_journeys' },
    { topic: 'Multi-channel journeys', category: 'flows_journeys' },
    
    // Channels
    { topic: 'Email messages and templates', category: 'email' },
    { topic: 'Transactional email API', category: 'email' },
    { topic: 'Push notifications', category: 'push_notifications' },
    { topic: 'SMS Twilio integration', category: 'sms' },
    { topic: 'In-app messages', category: 'in_app' },
    { topic: 'Slack notifications', category: 'integrations' },
    
    // Data & Segments
    { topic: 'Segments and filters', category: 'segmentation' },
    { topic: 'People attributes and events', category: 'events_tracking' },
    { topic: 'Data pipelines setup', category: 'data' },
    { topic: 'Object relationships', category: 'data' },
    
    // API
    { topic: 'Track API events', category: 'api_reference' },
    { topic: 'Transactional API', category: 'api_reference' },
    { topic: 'App API campaigns', category: 'api_reference' },
    { topic: 'Webhooks destinations', category: 'integrations' },
    
    // Testing
    { topic: 'A/B testing campaigns', category: 'testing' },
    { topic: 'Reporting and analytics', category: 'analytics' },
  ],
  
  hubspot: [
    // Email & Templates
    { topic: 'HubL templating language', category: 'liquid_templating' },
    { topic: 'If else conditions HubL', category: 'liquid_templating' },
    { topic: 'For loops HubL', category: 'liquid_templating' },
    { topic: 'Filters and functions HubL', category: 'liquid_templating' },
    { topic: 'Personalization tokens', category: 'liquid_templating' },
    
    // Workflows
    { topic: 'Marketing workflow automation', category: 'flows_journeys' },
    { topic: 'Workflow triggers and enrollment', category: 'flows_journeys' },
    { topic: 'If/then branches in workflows', category: 'flows_journeys' },
    { topic: 'Delays and scheduling', category: 'flows_journeys' },
    { topic: 'Sales sequences automation', category: 'flows_journeys' },
    
    // Email Marketing
    { topic: 'Email marketing campaigns', category: 'email' },
    { topic: 'Email templates and design', category: 'email' },
    { topic: 'Automated email sends', category: 'email' },
    { topic: 'Email deliverability', category: 'email' },
    
    // CRM
    { topic: 'CRM contacts and companies', category: 'crm' },
    { topic: 'Deals pipeline management', category: 'crm' },
    { topic: 'Custom properties and fields', category: 'crm' },
    { topic: 'Lists and segments', category: 'segmentation' },
    
    // Forms & Landing Pages
    { topic: 'Forms and lead capture', category: 'acquisition' },
    { topic: 'Landing pages builder', category: 'acquisition' },
    { topic: 'CTAs and popups', category: 'acquisition' },
    
    // API
    { topic: 'CRM API objects', category: 'api_reference' },
    { topic: 'Marketing API emails', category: 'api_reference' },
    { topic: 'Webhooks and subscriptions', category: 'integrations' },
    
    // Analytics
    { topic: 'Marketing analytics dashboards', category: 'analytics' },
    { topic: 'Attribution reporting', category: 'analytics' },
  ],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { platform, topics, runAll } = await req.json();

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Perplexity API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine which platforms and topics to process
    let platformsToProcess: string[] = [];
    
    if (runAll) {
      platformsToProcess = Object.keys(PLATFORM_TOPICS);
    } else if (platform) {
      platformsToProcess = [platform.toLowerCase()];
    }

    if (platformsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No platform specified. Use runAll:true or specify a platform.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allResults: Array<{
      platform: string;
      topic: string;
      category: string;
      success: boolean;
      error?: string;
    }> = [];

    let totalSuccess = 0;
    let totalFailed = 0;

    // Process each platform
    for (const platformKey of platformsToProcess) {
      const platformTopics = PLATFORM_TOPICS[platformKey];
      if (!platformTopics) {
        console.log(`Unknown platform: ${platformKey}`);
        continue;
      }

      console.log(`\n=== Discovering ${platformKey} documentation (${platformTopics.length} topics) ===`);

      // Use provided topics or all platform topics
      const topicsToProcess = topics || platformTopics;

      for (const topicData of topicsToProcess) {
        const topic = typeof topicData === 'string' ? topicData : topicData.topic;
        const category = typeof topicData === 'string' ? 'documentation' : topicData.category;

        try {
          const searchQuery = `${platformKey} ${topic} documentation guide tutorial best practices`;

          console.log(`Searching: ${topic}`);

          const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${perplexityApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'sonar',
              messages: [
                { 
                  role: 'system', 
                  content: `You are an expert technical writer specializing in ${platformKey} marketing automation platform. 
                  
Provide comprehensive, accurate documentation about the topic. Include:
- Complete syntax examples with code blocks
- Configuration steps
- Best practices and common pitfalls
- Real-world use case examples

Format in clear markdown with proper headings and code blocks.` 
                },
                { role: 'user', content: `Create detailed documentation for: ${searchQuery}` }
              ],
              search_recency_filter: 'year',
            }),
          });

          if (!response.ok) {
            console.error(`Failed to search topic "${topic}":`, response.status);
            allResults.push({ platform: platformKey, topic, category, success: false, error: `API error: ${response.status}` });
            totalFailed++;
            continue;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const citations = data.citations || [];

          if (content) {
            // Store in database with upsert
            const title = `${platformKey.charAt(0).toUpperCase() + platformKey.slice(1)}: ${topic}`;
            const sourceUrl = citations[0] || `perplexity://${platformKey}/${topic.replace(/\s+/g, '-').toLowerCase()}`;
            
            const { error: insertError } = await supabase
              .from('knowledge_documents')
              .upsert({
                source_url: sourceUrl,
                title,
                content,
                category,
                platform: platformKey,
                is_vendor_doc: true,
                content_type: 'markdown',
                metadata: { citations, generated_with: 'perplexity', topic },
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'source_url',
              });

            if (insertError) {
              console.error(`Database error for "${topic}":`, insertError);
              allResults.push({ platform: platformKey, topic, category, success: false, error: insertError.message });
              totalFailed++;
            } else {
              console.log(`✓ ${topic}`);
              allResults.push({ platform: platformKey, topic, category, success: true });
              totalSuccess++;
            }
          } else {
            allResults.push({ platform: platformKey, topic, category, success: false, error: 'No content returned' });
            totalFailed++;
          }

          // Delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 600));
        } catch (topicError) {
          console.error(`Error processing topic "${topic}":`, topicError);
          allResults.push({ 
            platform: platformKey, 
            topic, 
            category,
            success: false, 
            error: topicError instanceof Error ? topicError.message : 'Unknown error' 
          });
          totalFailed++;
        }
      }
    }

    console.log(`\n=== Discovery complete: ${totalSuccess} successful, ${totalFailed} failed ===`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        platforms: platformsToProcess,
        total: allResults.length,
        successful: totalSuccess,
        failed: totalFailed,
        results: allResults 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error discovering platform docs:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to discover docs';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
