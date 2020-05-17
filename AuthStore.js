import { observable, computed, action, autorun } from 'mobx';
import qs from 'qs';
const debug = require('debug')('model.AuthStore');

class AuthStore {
  @observable isLoggedIn = false;
  @observable isLoggedOut = false;
  @observable loginFailed = false;
  @observable loading = false;
  @observable error = '';
  @observable message = '';
  @observable username = '';
  @observable firstName = '';
  @observable lastName = '';
  @observable email = '';
  @observable phoneNumber = '';
  @observable sponsor = '';
  @observable hasPassword = false;
  @observable permissions = [];
  @observable sponsors = [];

  @observable refreshed = Date.now();

  constructor (restStore, configStore) {
    debug('constructor(%o, %o)', restStore, configStore);

    this.restStore = restStore;
    this.configStore = configStore;

    autorun(() => {
      if (this.isLoggedIn && restStore.expired === true) {
        debug(
          'this.isLoggedIn = %s, restStore.expired = %s',
          this.isLoggedIn,
          restStore.expired
        );
        this.logout();
      } else if (Number(restStore.status) === 401) {
        this.authenticate();
      }
    });
  }

  @action
  reset () {
    this.isLoggedIn = false;
    this.isLoggedOut = false;
    this.loginFailed = false;
    this.loading = false;
    this.error = '';
    this.message = '';
    this.username = '';
    this.firstName = '';
    this.lastName = '';
    this.email = '';
    this.phoneNumber = '';
    this.sponsor = '';
    this.hasPassword = false;
    this.permissions.replace([]);
    this.sponsors = [];
  }

  @action
  clearMessage () {
    this.message = '';
  }

  @action
  clearError () {
    this.error = '';
  }

  @computed
  get isReady () {
    return this.isLoggedIn;
  }

  getLoginURL (redirectURL, state) {
    debug('getLoginURL(%s,%s)', redirectURL, state);

    return (
      `${this.configStore.ssoHost}/oauth2/authorize?` +
      qs.stringify(
        {
          response_type: 'code',
          client_id: this.configStore.ssoId,
          redirect_uri: redirectURL,
          state: state
        },
        { skipNulls: true }
      )
    );
  }

  getLogoutURL (redirectURL, state) {
    debug('getLogoutURL(%s, %s)', redirectURL, state);

    if (state) {
      redirectURL += redirectURL.includes('?') ? '&' : '?';
      redirectURL += qs.stringify({ state }, { skipNulls: true });
    }

    return (
      `${this.configStore.ssoHost}/session/logout?` +
      qs.stringify(
        {
          redirect_uri: redirectURL
        },
        { skipNulls: true }
      )
    );
  }

  hasRole (module, ...roles) {
    const moduleRoles = this.permissions.find(
      moduleRoles => moduleRoles.module === module
    );
    if (moduleRoles && moduleRoles.roles)
      return !!roles.filter(role => moduleRoles.roles.includes(role)).length;
    return false;
  }

  @computed
  get modules () {
    return this.permissions.map(({ module }) => module);
  }

  @action
  authenticate () {
    debug('authenticate()');

    this.loading = true;
    return this.restStore
      .fetch(`/api/account`)
      .then(
        action(account => {
          debug(account);
          this.username = account.username;
          this.firstName = account.firstName;
          this.lastName = account.lastName;
          this.email = account.email;
          this.phoneNumber = account.phoneNumber;
          this.hasPassword = account.hasPassword;
          this.permissions.replace(account.permissions);
          this.sponsors = account.sponsors;
          if (account.sponsor) {
            this.sponsor = account.sponsor;
          }
          this.refreshed = Date.now();
          this.isLoggedIn = true;
          this.isLoggedOut = false;
          this.loginFailed = false;
          this.message = '';
          this.error = '';
          this.loading = false;
        })
      )
      .catch(err => {
        debug(err);
        this.reset();
        this.loginFailed = true;
      });
  }

  @action
  updateAccount (sponsor, updates) {
    debug('updateAccount(%s,%o)', sponsor, updates);

    return this.restStore
      .fetch(`/api/account`, {
        method: 'POST',
        body: JSON.stringify(updates)
      })
      .then(
        action(async account => {
          debug(account);
          if (account.passwordSet) {
            await this.logout();
            this.message = 'Your password has been updated.  Please log in.';
          } else {
            this.username = account.username;
            this.firstName = account.firstName;
            this.lastName = account.lastName;
            this.email = account.email;
            this.phoneNumber = account.phoneNumber;
            this.hasPassword = account.hasPassword;
            this.refreshed = Date.now();
            this.message = 'Account updated.';
            this.error = '';
          }
        })
      )
      .catch(
        action(err => {
          debug(err);
          this.message = '';
          const match = /.*({.*})/.exec(err.message);
          if (match) {
            const doc = JSON.parse(match[1]);
            this.error = doc.error_description;
          } else {
            this.error = 'Account update failed.';
          }
        })
      );
  }

  @action
  login (username, password) {
    debug('login(%s,%s)', username, password ? '<password>' : 'null');

    this.loading = true;

    return this.restStore
      .fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password
        }),
        skipRefresh: true
      })
      .then(
        action(account => {
          debug(account);
          this.username = account.username;
          this.firstName = account.firstName;
          this.lastName = account.lastName;
          this.email = account.email;
          this.phoneNumber = account.phoneNumber;
          this.hasPassword = account.hasPassword;
          this.permissions.replace(account.permissions);
          this.sponsors = account.sponsors;
          if (account.sponsor) {
            this.sponsor = account.sponsor;
          }
          this.refreshed = Date.now();
          this.isLoggedIn = true;
          this.isLoggedOut = false;
          this.loginFailed = false;
          this.error = '';
          this.message = '';
          this.loading = false;
          this.restStore.updateLastRefresh();
          this.restStore.resetExpired();
        })
      )
      .catch(
        action(() => {
          this.message = '';
          this.error = 'Your username or password was entered incorrectly.';
          this.loading = false;
          this.loginFailed = true;
        })
      );
  }

  @action
  logout () {
    debug('logout()');

    this.loading = true;

    return this.restStore
      .fetch('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({})
      })
      .then(
        action(() => {
          this.reset();
          this.message = 'You have successfully logged out.';
          this.refreshed = Date.now();
          this.restStore.clearTimeout();
          this.restStore.clearLastRefresh();
          this.isLoggedOut = true;
          this.isLoggedIn = false;
          this.loading = false;
        })
      )
      .catch(
        action(e => {
          this.reset();
          this.message =
            e.status === 401 ? 'You have successfully logged out.' : '';
          this.error = e.status === 401 ? '' : 'Logout attempt failed';
          this.refreshed = Date.now();
          this.restStore.clearTimeout();
          this.restStore.clearLastRefresh();
          this.isLoggedOut = true;
          this.isLoggedIn = false;
          this.loading = false;
        })
      );
  }

  @action
  forgotPassword (username) {
    debug('forgotPassword(%s)', username);

    return this.restStore
      .fetch(`/api/account/resend`, {
        method: 'POST',
        body: JSON.stringify({ username })
      })
      .catch(() => undefined);
  }
}

export default AuthStore;
