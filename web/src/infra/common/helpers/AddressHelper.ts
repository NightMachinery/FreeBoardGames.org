export default class AddressHelper {
  public static getGraphQLServerAddress() {
    return `/graphql`;
  }

  public static getWSServerAddress() {
    if (!window || window.location.hostname === 'localhost') {
      return 'ws://localhost:3001/graphql';
    } else {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${scheme}://${window.location.host}/graphql`;
    }
  }
}
