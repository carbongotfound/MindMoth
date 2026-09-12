/** Callback messaging works on Chromium variants without promise-listener support. */
export function request(type,fields={}) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('MindMoth did not respond. Reload the extension from its browser settings.')),10000);
    try {
      chrome.runtime.sendMessage({type,...fields},response=>{
        clearTimeout(timer);const error=chrome.runtime.lastError;
        if(error)return reject(Error(error.message));
        if(!response?.ok)return reject(Error(response?.error||'MindMoth could not complete that action.'));
        resolve(response);
      });
    } catch(error){clearTimeout(timer);reject(error);}
  });
}
