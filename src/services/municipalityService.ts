/**
 * Service for fetching Tunisian municipality data
 * Uses external API as primary source with local CSV as fallback
 */

interface MunicipalityDelegation {
  Name: string;
  NameAr: string;
  Value: string;
  PostalCode: string;
  Latitude: number;
  Longitude: number;
}

interface MunicipalityGovernorate {
  Name: string;
  NameAr: string;
  Value: string;
  Delegations: MunicipalityDelegation[];
}

interface LocalGovernorate {
  id: string;
  name: string;
}

interface LocalDelegation {
  id: string;
  name: string;
  governorateId: string;
}

// Local fallback data from CSV
const LOCAL_GOVERNORATES_DELEGATIONS = [
  { governorate: "Ariana", delegations: ["Ariana Medina", "Ettadhamen", "Kalaat el Andalous", "Mnihla", "Raoued", "Sidi Thabet", "Soukra"] },
  { governorate: "Béja", delegations: ["Amdoun", "Béja Nord", "Béja Sud", "Goubellat", "Medjez El Bab", "Nefza", "Teboursouk", "Testour", "Tibar"] },
  { governorate: "Ben Arous", delegations: ["Ben Arous", "Bou Mhel El Bassatine", "El Mourouj", "Ezzahra", "Fouchana", "Hammam Chôtt", "Hammam Lif", "La Nouvelle Medina", "Megrine", "Mohamedia", "Mornag", "Radès"] },
  { governorate: "Bizerte", delegations: ["Bizerte Nord", "Bizerte Sud", "Djoumine", "El Alia", "Ghar El Melh", "Ghezala", "Mateur", "Menzel Bourguiba", "Menzel Jemil", "Ras Jabel", "Sejenane", "Tinja", "Utique", "Zarzouna"] },
  { governorate: "Gabès", delegations: ["El Hamma", "El Metouia", "Gabes Medina", "Gabes Ouest", "Gabes Sud", "Ghannouch", "Menzel El Habib", "Mareth", "Matmata", "Nouvelle Matmata"] },
  { governorate: "Gafsa", delegations: ["Belkhir", "El Guetar", "El Ksar", "Gafsa Nord", "Gafsa Sud", "Mdhilla", "Metlaoui", "Oum El Araies", "Redeyef", "Sidi Aïch", "Sned"] },
  { governorate: "Jendouba", delegations: ["Aïn Draham", "Balta-Bou Aouane", "Bou Salem", "Fernana", "Ghardimaou", "Jendouba Sud", "Jendouba Nord", "Oued Meliz", "Tabarka"] },
  { governorate: "Kairouan", delegations: ["Alaâ", "Bou Hajla", "Chebika", "Echrarda", "Haffouz", "Hajeb El Ayoun", "Kairouan Nord", "Kairouan Sud", "Nasrallah", "Oueslatia", "Sbikha"] },
  { governorate: "Kassérine", delegations: ["El Ayoun", "Ezzouhour", "Fériana", "Foussana", "Haïdra", "Hassi El Ferid", "Jedelienne", "Kasserine Nord", "Kasserine Sud", "Majel Bel Abbès", "Sbeïtla", "Sbiba", "Thala"] },
  { governorate: "Kebili", delegations: ["Douz North", "Douz South", "Faouar", "Kebili North", "Kebili South", "Souk El Ahed"] },
  { governorate: "Le Kef", delegations: ["Dahmani", "Jérissa", "El Ksour", "Sers", "Kalâat Khasba", "Kalaat Senan", "Kef Est", "Kef Ouest", "Nebeur", "Sakiet Sidi Youssef", "Tajerouine"] },
  { governorate: "Mahdia", delegations: ["Bou Merdès", "Chebba", "Chorbane", "El Djem", "Essouassi", "Hebira", "Ksour Essef", "Mahdia", "Melloulèche", "Ouled Chamekh", "Sidi Alouane"] },
  { governorate: "Manouba", delegations: ["Borj El Amri", "Djedeida", "Douar Hicher", "El Battan", "Manouba", "Mornaguia", "Oued Ellil", "Tebourba"] },
  { governorate: "Médenine", delegations: ["Médenine Nord", "Médenine Sur", "Beni Khedech", "Ben Guerdane", "Zarzis", "Djerba Houmet Souk", "Djerba Midoun", "Djerba Ajim", "Sidi Makhloulf"] },
  { governorate: "Monastir", delegations: ["Bekalta", "Bembla", "Beni Hassen", "Jemmal", "Ksar Hellal", "Ksibet el-Médiouni", "Moknine", "Monastir", "Ouerdanine", "Sahline", "Sayada-Lamta-Bou Hajar", "Téboulba", "Zéramdine"] },
  { governorate: "Nabeul", delegations: ["Béni Khalled", "Béni Khiar", "Bou Argoub", "Dar Châabane El Fehri", "El Haouaria", "El Mida", "Grombalia", "Hammamet", "Hammam El Guezaz", "Kélibia", "Korba", "Menzel Bouzelfa", "Menzel Temime", "Nabeul", "Soliman", "Takelsa"] },
  { governorate: "Sfax", delegations: ["Agareb", "Bir Ali Ben Khalifa", "El Amra", "El Hencha", "Graïba", "Jebiniana", "Kerkennah", "Mahrès", "Menzel Chaker", "Sakiet Eddaïer", "Sakiet Ezzit", "Sfax Ouest", "Sfax Sud", "Sfax Ville", "Skhira", "Thyna"] },
  { governorate: "Sidi Bouzid", delegations: ["Bir El Hafey", "Cebbala Ouled Asker", "Jilma", "Meknassy", "Menzel Bouzaiane", "Mezzouna", "Ouled Haffouz", "Regueb", "Sidi Ali Ben Aoun", "Sidi Bouzid Est", "Sidi Bouzid Ouest", "Souk Jedid"] },
  { governorate: "Siliana", delegations: ["Bargou", "Bou Arada", "El Aroussa", "El Krib", "Gaâfour", "Kesra", "Makthar", "Rouhia", "Sidi Bou Rouis", "Siliana Nord", "Siliana Sud"] },
  { governorate: "Sousse", delegations: ["Akouda", "Bouficha", "Enfida", "Hammam Sousse", "Hergla", "Kalâa Kebira", "Kalâa Seghira", "Kondar", "M'saken", "Sidi Bou Ali", "Sidi El Hani", "Sousse Jawhara", "Sousse Médina", "Sousse Riadh", "Sousse Sidi Abdelhamid"] },
  { governorate: "Tataouine", delegations: ["Bir Lahmar", "Dehiba", "Ghomrassen", "Remada", "Smâr", "Tataouine Nord", "Tataouine Sud"] },
  { governorate: "Tozeur", delegations: ["Degache", "Hazoua", "Nefta", "Tameghza", "Tozeur"] },
  { governorate: "Tunis", delegations: ["Bab El Bhar", "Bab Souika", "Carthage", "Cité El Khadra", "Djebel Jelloud", "El Kabaria", "El Menzah", "El Omrane", "El Omrane supérieur", "El Ouardia", "Ettahrir", "Ezzouhour", "Hraïria", "La Goulette", "La Marsa", "Le Bardo", "Le Kram", "Médina", "Séjoumi", "Sidi El Béchir", "Sidi Hassine"] },
  { governorate: "Zaghouan", delegations: ["Bir Mcherga", "El Fahs", "Nadhour", "Saouaf", "Zaghouan", "Zriba"] }
];

export class MunicipalityService {
  private static readonly API_BASE_URL = 'https://tn-municipality-api.vercel.app/api';
  private static readonly TIMEOUT = 5000; // 5 seconds timeout

  /**
   * Fetch all governorates with their delegations
   */
  static async getAllMunicipalities(): Promise<MunicipalityGovernorate[]> {
    try {
      console.log('🌐 Fetching municipalities from external API...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      const response = await fetch(`${this.API_BASE_URL}/municipalities`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: MunicipalityGovernorate[] = await response.json();
      console.log('✅ Successfully fetched municipalities from API');
      return data;
    } catch (error) {
      console.warn('⚠️ External API failed, using local fallback:', error);
      return this.getLocalFallbackData();
    }
  }

  /**
   * Fetch governorates only (simplified list)
   */
  static async getGovernorates(): Promise<{ id: string; name: string; nameAr?: string }[]> {
    try {
      const municipalities = await this.getAllMunicipalities();
      return municipalities.map((gov, index) => ({
        id: `gov-${index + 1}`,
        name: gov.Name,
        nameAr: gov.NameAr
      }));
    } catch (error) {
      console.warn('⚠️ Failed to fetch governorates, using local fallback');
      return this.getLocalGovernorates();
    }
  }

  /**
   * Fetch delegations for a specific governorate
   */
  static async getDelegationsByGovernorate(governorateName: string): Promise<{ id: string; name: string; nameAr?: string; governorateId: string }[]> {
    try {
      console.log(`🔍 Fetching delegations for governorate: ${governorateName}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      const response = await fetch(`${this.API_BASE_URL}/municipalities?name=${encodeURIComponent(governorateName.toLowerCase())}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: MunicipalityGovernorate[] = await response.json();
      
      if (data.length > 0 && data[0].Delegations) {
        const governorateId = `gov-${governorateName.toLowerCase().replace(/\s+/g, '-')}`;
        return data[0].Delegations.map((del, index) => ({
          id: `del-${governorateId}-${index + 1}`,
          name: del.Name,
          nameAr: del.NameAr,
          governorateId
        }));
      }

      throw new Error('No delegations found');
    } catch (error) {
      console.warn(`⚠️ Failed to fetch delegations for ${governorateName}, using local fallback`);
      return this.getLocalDelegations(governorateName);
    }
  }

  /**
   * Search municipalities by name or delegation
   */
  static async searchMunicipalities(query: string): Promise<MunicipalityGovernorate[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

      const response = await fetch(`${this.API_BASE_URL}/municipalities?name=${encodeURIComponent(query.toLowerCase())}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: MunicipalityGovernorate[] = await response.json();
      return data;
    } catch (error) {
      console.warn('⚠️ Search failed, using local fallback');
      return this.searchLocalFallback(query);
    }
  }

  /**
   * Get local fallback data from CSV
   */
  private static getLocalFallbackData(): MunicipalityGovernorate[] {
    return LOCAL_GOVERNORATES_DELEGATIONS.map((gov, govIndex) => ({
      Name: gov.governorate,
      NameAr: gov.governorate, // We don't have Arabic names in CSV
      Value: gov.governorate.toUpperCase().replace(/\s+/g, '_'),
      Delegations: gov.delegations.map((del, delIndex) => ({
        Name: del,
        NameAr: del,
        Value: del.toUpperCase().replace(/\s+/g, '_'),
        PostalCode: `${1000 + govIndex * 100 + delIndex}`, // Generate fake postal codes
        Latitude: 36.8 + (Math.random() - 0.5) * 5, // Approximate Tunisia coordinates
        Longitude: 10.2 + (Math.random() - 0.5) * 8
      }))
    }));
  }

  /**
   * Get local governorates from fallback data
   */
  private static getLocalGovernorates(): { id: string; name: string }[] {
    return LOCAL_GOVERNORATES_DELEGATIONS.map((gov, index) => ({
      id: `gov-local-${index + 1}`,
      name: gov.governorate
    }));
  }

  /**
   * Get local delegations for a governorate
   */
  private static getLocalDelegations(governorateName: string): { id: string; name: string; governorateId: string }[] {
    const gov = LOCAL_GOVERNORATES_DELEGATIONS.find(
      g => g.governorate.toLowerCase() === governorateName.toLowerCase()
    );
    
    if (!gov) {
      return [];
    }

    const governorateId = `gov-local-${governorateName.toLowerCase().replace(/\s+/g, '-')}`;
    return gov.delegations.map((del, index) => ({
      id: `del-local-${governorateId}-${index + 1}`,
      name: del,
      governorateId
    }));
  }

  /**
   * Search in local fallback data
   */
  private static searchLocalFallback(query: string): MunicipalityGovernorate[] {
    const lowercaseQuery = query.toLowerCase();
    return this.getLocalFallbackData().filter(gov =>
      gov.Name.toLowerCase().includes(lowercaseQuery) ||
      gov.Delegations.some(del => del.Name.toLowerCase().includes(lowercaseQuery))
    );
  }

  /**
   * Check if external API is available
   */
  static async checkAPIAvailability(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Short timeout for availability check

      const response = await fetch(`${this.API_BASE_URL}/municipalities`, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

export default MunicipalityService;