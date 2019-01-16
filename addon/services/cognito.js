import Service from '@ember/service';
import { Promise } from 'rsvp';
import { CognitoUserPool } from "amazon-cognito-identity-js";
import CognitoStorage from '../utils/cognito-storage';
import CognitoUser from '../utils/cognito-user';
import { later, cancel } from '@ember/runloop';
import { inject as service } from '@ember/service';
import { sha256 } from 'js-sha256';

/**
 * @public
 * This is a container for easily accessing the logged-in CognitoUser object,
 * as well as creating others using signUp().
 */
export default Service.extend({
  session: service(),

  willDestroy() {
    this._super(...arguments);
    this.stopRefreshTask();
  },


  // Primarily used so we can stub methods.
  _stubPool(pool) {
    return pool;
  },

  /**
   * Method for signing up a user.
   *
   * @param username User's username
   * @param password Plain-text initial password entered by user.
   * @param attributeList New user attributes.
   * @param validationData Application metadata.
   */
  signUp(username, password, attributeList, validationData) {
    let { poolId, clientId } = this.getProperties('poolId', 'clientId');
    let pool = this._stubPool(new CognitoUserPool({
      UserPoolId: poolId,
      ClientId: clientId,
      Storage: new CognitoStorage({})
    }));

    return new Promise((resolve, reject) => {
      pool.signUp(username, password, attributeList, validationData, (err, result) => {
        if (err) {
          reject(err);
        } else {
          result.user = CognitoUser.create({ user: result.user });
          resolve(result);
        }
      });
    }, `cognito-service#signUp`);
  },

  /**
   * Enable the token refresh timer.
   */
  startRefreshTask(session) {
    if (!this.get('autoRefreshSession')) {
      return;
    }
    // Schedule a task for just past when the token expires.
    const now = Math.floor(new Date() / 1000);
    const exp = session.getIdToken().getExpiration();
    const adjusted = now - session.getClockDrift();
    const duration = (exp - adjusted) * 1000 + 100;
    this.set('_taskDuration', duration);
    this.set('task', later(this, 'refreshSession', duration));
  },

  /**
   * Disable the token refresh timer.
   */
  stopRefreshTask() {
    cancel(this.get('task'));
    this.set('task', undefined);
    this.set('_taskDuration', undefined);
  },

  refreshSession() {
    let user = this.get('user');
    if (user) {
      return this.get('session').authenticate('authenticator:cognito', { state: { name: 'refresh' } });
    }
  },

  _base64UrlEncoded(data) {
    return btoa(data).replace(/=+$/, "").replace(/\+/g, '-').replace(/\//g, '_');
  },

  getOAuthUrl(responseType = 'code', redirectUri, idpName, scope) {
    let { hostedBase, clientId } = this.getProperties('hostedBase', 'clientId');
    let url = (
      hostedBase + '/oauth2/authorize'
        + '?response_type=' + responseType
        + '&client_id=' + clientId
        + '&redirect_uri=' + redirectUri
        + '&state=notYetRandom'
    );
    if (responseType === 'code') {
      window.sessionStorage.setItem('ember-cognito.redirectUri', redirectUri);
      let code = window.sessionStorage.getItem('ember-cognito.oauthCode');
      if (! code) {
        // generate a random 32 byte string
        let codeArray = new Uint8Array(32);
        window.crypto.getRandomValues(codeArray);
        code = codeArray.reduce(
          (a, b) => { return a + String.fromCharCode(b); },
          '');
        window.sessionStorage.setItem('ember-cognito.oauthCode', code);
      }
      let codeHash = sha256.create();
      codeHash.update(code);

      let codeEncoded = this._base64UrlEncoded(codeHash.array().reduce(
        (a, b) => { return a + String.fromCharCode(b); }, ''));
        
      url += '&code_challenge_method=S256&code_challenge=' + codeEncoded;
    }
    
    if (idpName) {
      url += '&identity_provider=' + idpName;
    }
    if (scope) {
      url += '&scope=' + scope;
    }
    
    return url;
  },

  getOAuthTokenRequest(code) {
    let { hostedBase, clientId } = this.getProperties('hostedBase', 'clientId');
    let redirectUri = window.sessionStorage.getItem('ember-cognito.redirectUri');
    let oauthCode = window.sessionStorage.getItem('ember-cognito.oauthCode');
    
    return {
      url: hostedBase + '/oauth2/token',
      formData: (
        'grant_type=authorization_code'
          + '&code=' + code
          + '&client_id=' + clientId
          + '&redirect_uri=' + redirectUri
          + '&code_verifier=' + this._base64UrlEncoded(oauthCode)
      )
    }
  }
  
});
