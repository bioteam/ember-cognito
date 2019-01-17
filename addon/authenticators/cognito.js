import { readOnly } from '@ember/object/computed';
import { inject as service } from '@ember/service';
import { merge } from '@ember/polyfills';
import { resolve, reject, Promise } from 'rsvp';
import { getProperties, get, set } from '@ember/object';
import { AuthenticationDetails } from 'amazon-cognito-identity-js';
import {
  CognitoUser as AWSCognitoUser,
  CognitoUserPool,
  CognitoUserSession,
  CognitoIdToken,
  CognitoAccessToken,
  CognitoRefreshToken
} from 'amazon-cognito-identity-js';
import Base from 'ember-simple-auth/authenticators/base';
import CognitoStorage from '../utils/cognito-storage';
import CognitoUser from '../utils/cognito-user';

export default Base.extend({
  cognito: service(),
  poolId: readOnly('cognito.poolId'),
  clientId: readOnly('cognito.clientId'),

  _stubUser(user) {
    return user;
  },

  _getCurrentUser(data) {
    let pool = new CognitoUserPool({
      UserPoolId: data.poolId,
      ClientId: data.clientId,
      Storage: new CognitoStorage(data)
    });
    let user = pool.getCurrentUser();
    if (!user) {
      return null;
    }
    return CognitoUser.create({ user: this._stubUser(user) });
  },

  restore(data) {
    let user = this._getCurrentUser(data);
    if (user) {
      return user.getSession().then((session) => {
        if (session.isValid()) {
          /* eslint-disable camelcase */
          set(this, 'cognito.user', user);
          get(this, 'cognito').startRefreshTask(session);
          // Resolve with the new data the user set, in case
          // the session needed to be refreshed.
          let newData = user.getStorageData();
          newData.access_token = session.getIdToken().getJwtToken();
          return newData;
        } else {
          return reject('session is invalid');
        }
      });
    }
    return reject('no current user');
  },

  _resolveAuth(resolve, result, { pool, user }) {
    /* eslint-disable camelcase */

    // Make sure to put the idToken in a place where the DataAdapterMixin wants it (access_token)
    // Add any data that's from the user's and pool's storage.
    let data = merge({
      access_token: result.getIdToken().getJwtToken(),
      poolId: pool.getUserPoolId(),
      clientId: pool.getClientId()
    }, pool.storage.getData());

    set(this, 'cognito.user', CognitoUser.create({ user }));
    get(this, 'cognito').startRefreshTask(result);
    resolve(data);
  },

  _handleRefresh(/* params */) {
    let user = get(this, 'cognito.user');
    // Get the session, which will refresh it if necessary
    return user.getSession().then((session) => {
      if (session.isValid()) {
        get(this, 'cognito').startRefreshTask(session);
        let newData = user.getStorageData();
        newData.access_token = session.getIdToken().getJwtToken();
        // newData.refreshed = new Date().toISOString();
        return newData;
      } else {
        return reject('session is invalid');
      }
    });
  },

  _handleNewPasswordRequired({ state, password }) {
    return new Promise((resolve, reject) => {
      let that = this;
      state.user.completeNewPasswordChallenge(password, state.userAttributes, {
        onSuccess(result) {
          that._resolveAuth(resolve, result, state);
        },
        onFailure(err) {
          reject(err);
        }
      });
    }, 'cognito:newPasswordRequired');
  },

  _getTokensFromCode(code) {
    return new Promise((resolve, reject) => {
      let tokenReq = get(this, 'cognito').getOAuthTokenRequest(code);
      let client = new XMLHttpRequest();
      client.open("POST", tokenReq.url);
      client.responseType = "json";
      client.setRequestHeader('Content-type',
                              'application/x-www-form-urlencoded');
      client.setRequestHeader("Accept", "application/json");
      client.onreadystatechange = () => {
        if (client.readyState === client.DONE) {
          if (client.status === 200) {
            resolve(client.response);
          } else {
            reject(client);
          }
        }
      };
      client.send(tokenReq.formData);
    });
  },
  
  _handleParsedQueryHash(pqh) {
    return new Promise((resolve) => {
      let that = this;
      let { poolId, clientId } = getProperties(this, 'poolId', 'clientId');
      let pool = new CognitoUserPool({
        UserPoolId: poolId,
        ClientId: clientId,
        Storage: new CognitoStorage({})
      });
      let idToken = new CognitoIdToken({ IdToken: pqh.id_token });
      let user = this._stubUser(new AWSCognitoUser({ Username: idToken.payload['cognito:username'], Pool: pool, Storage: pool.storage }));
      let sess = new CognitoUserSession({
        ClockDrift: 0,
        IdToken: idToken,
        RefreshToken: new CognitoRefreshToken({ RefreshToken:pqh.refresh_token }),
        AccessToken: new CognitoAccessToken({ AccessToken:pqh.access_token })
      });
      user.setSignInUserSession(sess);
      that._resolveAuth(resolve, sess, { pool, user });
    }, 'cognito:authenticate');
  },

  _handleQueryHash(/* params */) {
    if (window.parsedQueryHash.code) {
      let that = this;
      return this._getTokensFromCode(window.parsedQueryHash.code)
        .then((json) => {
          return that._handleParsedQueryHash(json);
        });
    } else if (window.parsedQueryHash.access_token) {
      return this._handleParsedQueryHash(window.parsedQueryHash);
    } else {
      return new Promise();
    }
  },
  
  _handleState(name, params) {
    if (name === 'refresh') {
      return this._handleRefresh(params);
    } else if (name === 'newPasswordRequired') {
      return this._handleNewPasswordRequired(params);
    } else if (name === 'handleQueryHash') {
      return this._handleQueryHash(params);
    } else {
      throw new Error('invalid state');
    }
  },

  authenticate(params) {
    let { username, password, state } = params;

    if (state) {
      return this._handleState(state.name, params);
    }

    return new Promise((resolve, reject) => {
      let that = this;

      let { poolId, clientId } = getProperties(this, 'poolId', 'clientId');
      let pool = new CognitoUserPool({
        UserPoolId: poolId,
        ClientId: clientId,
        Storage: new CognitoStorage({})
      });
      let user = this._stubUser(new AWSCognitoUser({ Username: username, Pool: pool, Storage: pool.storage }));
      let authDetails = new AuthenticationDetails({ Username: username, Password: password });

      user.authenticateUser(authDetails, {
        onSuccess(result) {
          that._resolveAuth(resolve, result, { pool, user });
        },
        onFailure(err) {
          reject(err);
        },
        newPasswordRequired(userAttributes /* , requiredAttributes */) {
          // ember-simple-auth doesn't allow a "half" state like this --
          // the promise either resolves, or rejects.
          // In this case, we have to reject, because we can't let
          // ember-simple-auth think that the user is successfully
          // authenticated.
          delete userAttributes.email_verified;
          reject({
            state: {
              name: 'newPasswordRequired',
              user,
              userAttributes,
              pool
            }
          });
        }
      });
    }, 'cognito:authenticate');
  },

  invalidate(data) {
    let user = this._getCurrentUser(data);
    user.signOut();
    set(this, 'cognito.user', undefined);
    return resolve(data);
  }
});
