import { computed, observable, autorun, action } from 'mobx';

const debug = require('debug')('model.SponsorStore');

const ALL_SPONSORS = { name: 'All Sponsors' };

export default class SponsorStore {
  @observable selectedSponsor = null;
  @observable isTranslationEnabled = false;
  @observable loading = false;
  @observable requestedSponsor;

  constructor(restStore, configStore, authStore) {
    debug('constructor()');

    this.restStore = restStore;
    this.configStore = configStore;
    this.authStore = authStore;

    autorun(() => {
      debug('autorun triggered for %s', authStore.sponsor);
      if (authStore.isReady)
        if (this.multiSponsor) {
          if (authStore.sponsor) {
            this.sponsor = configStore.sponsors.find(
              ({ url }) => url === authStore.sponsor
            );
          } else {
            this.sponsor = null;
          }
        } else this.enableTranslations();
    });
  }

  processSponsorChange = (sessionStorage) => {
    this.setSponsor(this.requestedSponsor, sessionStorage)
  }

  cancelRequestedSponsor = () => {
    this.requestedSponsor = undefined;
  }

  sponsorName(sponsorId) {
    const sponsor = this.sponsors.find(({ id }) => id === sponsorId);
    if (sponsor) return sponsor.name;
    return null;
  }

  @computed
  get multiSponsor() {
    const multiSponsor = this.configStore.multiSponsor;

    debug('get multiSponsor() -> %s', multiSponsor);

    return multiSponsor;
  }

  @computed
  get global() {
    const global = this.multiSponsor && !this.authStore.sponsors.length;

    debug('get global() -> %s', global);

    return global;
  }

  @computed
  get hasSponsor() {
    return (
      !this.multiSponsor || (this.selectedSponsor && this.selectedSponsor.id)
    );
  }

  set sponsor(sponsor) {
    debug('set sponsor(%o)', sponsor);
    let selectedSponsor;
    this.loading = true;
    if (!this.multiSponsor) {
      this.loading = false;
      throw new Error('Cannot change sponsor for single-sponsor site');
    }

    if (!sponsor) {
      selectedSponsor = this.authStore.sponsors.length
        ? this.sponsors[0]
        : null;
    } else {
      if (!this.configStore.sponsors.find(({ url }) => url === sponsor.url)) {
        this.loading = false;
        throw new Error('Unknown sponsor');
      }

      selectedSponsor = { ...sponsor };
    }

    this.restStore
      .fetch('/api/auth/context', {
        method: 'POST',
        body: JSON.stringify({
          sponsor: (selectedSponsor || {}).url,
        }),
      })
      .then(
        action(() => {
          if (selectedSponsor && selectedSponsor.id)
            sessionStorage.setItem('selectedSponsorId', selectedSponsor.id);
          else sessionStorage.removeItem('selectedSponsorId');
          this.selectedSponsor = selectedSponsor;
          this.loading = false;
          this.enableTranslations();
        })
      );
  }

  @computed
  get sponsor() {
    let sponsor;
    if (this.multiSponsor) {
      if (this.global) {
        sponsor = this.selectedSponsor || ALL_SPONSORS;
      } else {
        sponsor = this.selectedSponsor || this.sponsors[0];
      }
    } else {
      sponsor = {
        id: this.configStore.sponsor.substr(
          this.configStore.sponsor.lastIndexOf('/') + 1
        ),
        url: this.configStore.sponsor,
        name: this.configStore.siteName,
      };
    }

    debug('get sponsor() -> %o', sponsor);
    return this.appendTypeFlags(sponsor);
  }

  @computed
  get sponsors() {
    let sponsors;
    if (this.multiSponsor) {
      sponsors = !this.global
        ? this.authStore.sponsors.map((sponsor) =>
            this.configStore.sponsors.find(({ url }) => url === sponsor)
          )
        : this.configStore.sponsors;
    } else {
      sponsors = [this.sponsor];
    }

    debug('get sponsors() -> %o', sponsors);

    return sponsors
      .filter(Boolean)
      .map((sponsor) => this.appendTypeFlags(sponsor));
  }

  @action
  enableTranslations() {
    debug('Enable Translations(%o,%s)');
    const { id } = this.sponsor;
    this.isTranslationEnabled = false;
    return this.restStore
      .fetch(`/api/auth/enableTranslation`, {
        method: 'GET',
      })
      .then(
        action((sponsor) => {
          if (this.multiSponsor) {
            if (!this.hasSponsor && this.global)
              this.isTranslationEnabled = true;
            //for consumer scenario
            else
              this.isTranslationEnabled = sponsor.adminSpecificSponsors.includes(
                id
              );
          } else {
            this.isTranslationEnabled = sponsor.specificSponsors.includes(id);
          }
        })
      );
  }

  @action
  suggest({ repo = 'uat' }) {
    return Promise.resolve(
      this.sponsors.map(({ id: value, name: text }) => ({
        value,
        text,
      }))
    );
  }

  @action
  setSponsor(sponsor, sessionStorage) {
    this.sponsor = this.sponsors.find(({ id }) => id === sponsor);
    if (this.sponsor.id)
      sessionStorage.setItem('selectedSponsorId', this.sponsor.id);
    else sessionStorage.removeItem('selectedSponsorId');
    this.requestedSponsor = undefined;

  }

  @action
  getSponsorId = (sessionStorage) => {
    if (sessionStorage.getItem('selectedSponsorId'))
      return sessionStorage.getItem('selectedSponsorId');
    if (this.sponsor && this.sponsor.id) return this.sponsor.id;
    return undefined;
  };
  @action
  isCommunity (sponsorId)
  {
    return sponsorId && sponsorId.indexOf('CM_') === 0;
  }
  @action
  isEnterprise (sponsorId)
  {
    return sponsorId && sponsorId.indexOf('CM_') !== 0;
  }
  @action
  getSponsorName = (sessionStorage) => {
    const selectedSponsorId = this.getSponsorId(sessionStorage);
    let sponsor;
    if (selectedSponsorId !== this.sponsor.id)
      sponsor = this.sponsors.find(({ id }) => id === selectedSponsorId);
    else sponsor = this.sponsor;
    return sponsor && sponsor.name ? sponsor.name : null;
  };

  @action
  getSponsorById = (sponsorId) => {
    if(this.sponsors && sponsorId)
      return this.sponsors.find(({id})=>sponsorId === id); 
    return null;
  };

  appendTypeFlags(sponsor) {
    return {
      ...sponsor,
      isCommunity: this.isCommunity(sponsor.id),
      isEnterprise: this.isEnterprise(sponsor.id)
    };
  }
}
