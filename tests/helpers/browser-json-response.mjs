// Start reading while the response still belongs to its originating document.
// The caller registers this capture before clicking an action that may navigate.
export function captureBrowserJsonResponse(responsePromise){
 const captured=responsePromise.then(async response=>({status:response.status(),body:await response.json()}))
 void captured.catch(()=>{})
 return captured
}
