import { CONFIG } from './config.js';

const shared=window.__fitnestSupabase=window.__fitnestSupabase||{client:null,promise:null};

export async function getSupabaseClient(){
  if(shared.client)return shared.client;
  if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey)return null;
  if(!shared.promise){
    shared.promise=import('https://esm.sh/@supabase/supabase-js@2')
      .then(({createClient})=>{
        shared.client=createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{
          auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
        });
        return shared.client;
      })
      .catch(error=>{
        shared.promise=null;
        throw error;
      });
  }
  return shared.promise;
}
