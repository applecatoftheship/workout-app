import { supabase } from './client'

export type PushSubscriptionInput = {
  deviceId: string
  endpoint: string
  p256dh: string | null
  auth: string | null
}

export async function upsertPushSubscription(input: PushSubscriptionInput): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      device_id: input.deviceId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    throw error
  }
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)

  if (error) {
    throw error
  }
}
