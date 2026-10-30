/** Show a server worktree path only for a same-computer development preview.
 * Production bundles receive an empty value; never pretend a remote server's
 * filesystem is the user's computer. */
export function localConnectorLocation(directory:string,hostname:string,development:boolean):{directory:string;command:string}|null{
  if(!development||!['localhost','127.0.0.1','[::1]'].includes(hostname)||
     typeof directory!=='string'||!/^[A-Za-z]:[\\/]/.test(directory)||/[\x00-\x1f\x7f]/.test(directory)||directory.length>2000)return null
  const normalized=directory.replace(/[\\/]+$/,'')
  return {directory:normalized,command:"& '"+(normalized+'\\start-connect.cmd').replaceAll("'","''")+"'"}
}
