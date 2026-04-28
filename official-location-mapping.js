/**
 * COMPLETE OFFICIAL BIGDATIS LOCATION MAPPING
 * Fetches live data from https://cdn.bigdatis.com/data/locations.js
 * Falls back to local cache if CDN is unreachable
 * Used for safe location handling with fallback mechanisms
 */

// Local fallback — a subset kept for offline use (will be replaced by CDN data)
const officialLocations = [
    {id: 47, level: 2, name: "Hammam Lif, Ben Arous", use: true},
    {id: 39, level: 2, name: "Testour, Beja", use: true},
    {id: 40, level: 2, name: "Thibar, Beja", use: true},
    {id: 37, level: 2, name: "Nefza, Beja", use: true},
    {id: 41, level: 2, name: "Ben Arous, Ben Arous", use: true},
    {id: 126, level: 2, name: "Borj El Amri, La Manouba", use: true},
    {id: 34, level: 2, name: "Beja Sud, Beja", use: true},
    {id: 44, level: 2, name: "Ezzahra, Ben Arous", use: true},
    {id: 5377, level: 2, name: "Sousse Sud, Sousse", use: true},
    {id: 45, level: 2, name: "Fouchana, Ben Arous", use: true},
    {id: 54, level: 2, name: "Bizerte Sud, Bizerte", use: true},
    {id: 55, level: 2, name: "El Alia, Bizerte", use: true},
    {id: 4994, level: 3, name: "Ksar Said 1, Le Bardo, Tunis", use: true},
    {id: 38, level: 2, name: "Téboursouk, Beja", use: true},
    {id: 32, level: 2, name: "Amdoun, Beja", use: true},
    {id: 2195, level: 3, name: "Sbeïtla, Sbeïtla, Kasserine", use: true},
    {id: 52, level: 2, name: "Radès, Ben Arous", use: true},
    {id: 36, level: 2, name: "Medjez El Bab, Beja", use: true},
    {id: 80, level: 2, name: "Mdhilla, Gafsa", use: true},
    {id: 49, level: 2, name: "Mohammedia, Ben Arous", use: true},
    {id: 77, level: 2, name: "Belkhir, Gafsa", use: true},
    {id: 71, level: 2, name: "Gabès Sud, Gabès", use: true},
    {id: 58, level: 2, name: "Zarzouna, Bizerte", use: true},
    {id: 73, level: 2, name: "Mareth, Gabès", use: true},
    {id: 88, level: 2, name: "Ain Draham, Jendouba", use: true},
    {id: 57, level: 2, name: "Ghezala, Bizerte", use: true},
    {id: 59, level: 2, name: "Joumine, Bizerte", use: true},
    {id: 65, level: 2, name: "Tinja, Bizerte", use: true},
    {id: 74, level: 2, name: "Matmata, Gabès", use: true},
    {id: 81, level: 2, name: "Gafsa Nord, Gafsa", use: true},
    {id: 70, level: 2, name: "Gabès Ouest, Gabès", use: true},
    {id: 76, level: 2, name: "Nouvelle Matmata, Gabès", use: true},
    {id: 84, level: 2, name: "Moularès, Gafsa", use: true},
    {id: 95, level: 2, name: "Oued Meliz, Jendouba", use: true},
    {id: 105, level: 2, name: "Nasrallah, Kairouan", use: true},
    {id: 99, level: 2, name: "Cherarda, Kairouan", use: true},
    {id: 66, level: 2, name: "Utique, Bizerte", use: true},
    {id: 56, level: 2, name: "Ghar El Melh, Bizerte", use: true},
    {id: 72, level: 2, name: "Ghannouch, Gabès", use: true},
    {id: 61, level: 2, name: "Menzel Bourguiba, Bizerte", use: true},
    {id: 67, level: 2, name: "El Hamma, Gabès", use: true},
    {id: 68, level: 2, name: "Métouia, Gabès", use: true},
    {id: 78, level: 2, name: "El Guettar, Gafsa", use: true},
    {id: 79, level: 2, name: "El Ksar, Gafsa", use: true},
    {id: 90, level: 2, name: "Bou Salem, Jendouba", use: true},
    {id: 92, level: 2, name: "Ghardimaou, Jendouba", use: true},
    {id: 97, level: 2, name: "Bou Hajla, Kairouan", use: true},
    {id: 100, level: 2, name: "El Alâa, Kairouan", use: true},
    {id: 101, level: 2, name: "Haffouz, Kairouan", use: true},
    {id: 102, level: 2, name: "Hajeb El Ayoun, Kairouan", use: true},
    {id: 106, level: 2, name: "Oueslatia, Kairouan", use: true},
    {id: 83, level: 2, name: "Métlaoui, Gafsa", use: true},
    {id: 85, level: 2, name: "Redeyef, Gafsa", use: true},
    {id: 91, level: 2, name: "Fernana, Jendouba", use: true},
    {id: 93, level: 2, name: "Jendouba, Jendouba", use: true},
    {id: 94, level: 2, name: "Jendouba Nord, Jendouba", use: true},
    {id: 82, level: 2, name: "Gafsa Sud, Gafsa", use: true},
    {id: 96, level: 2, name: "Tabarka, Jendouba", use: true},
    {id: 87, level: 2, name: "Sned, Gafsa", use: true},
    {id: 131, level: 2, name: "Mornaguia, La Manouba", use: true},
    {id: 151, level: 2, name: "La Chebba, Mahdia", use: true},
    {id: 128, level: 2, name: "El Battan, La Manouba", use: true},
    {id: 135, level: 2, name: "El Ksour, El Kef", use: true},
    {id: 149, level: 2, name: "Hebira, Mahdia", use: true},
    {id: 146, level: 2, name: "Boumerdes, Mahdia", use: true},
    {id: 133, level: 2, name: "Tébourba, La Manouba", use: true},
    {id: 143, level: 2, name: "Sakiet Sidi Youssef, El Kef", use: true},
    {id: 139, level: 2, name: "El Kef Est, El Kef", use: true},
    {id: 134, level: 2, name: "Dahmani, El Kef", use: true},
    {id: 3722, level: 3, name: "El Ghraba, El Hencha, Sfax", use: true},
    {id: 138, level: 2, name: "Kalâat Senan, El Kef", use: true},
    {id: 144, level: 2, name: "Tajerouine, El Kef", use: true},
    {id: 140, level: 2, name: "El Kef Ouest, El Kef", use: true},
    {id: 119, level: 2, name: "Sbiba, Kasserine", use: true},
    {id: 121, level: 2, name: "Douz, Kébili", use: true},
    {id: 141, level: 2, name: "Sers, El Kef", use: true},
    {id: 109, level: 2, name: "Ezzouhour, Kasserine", use: true},
    {id: 107, level: 2, name: "Sbikha, Kairouan", use: true},
    {id: 108, level: 2, name: "El Ayoun, Kasserine", use: true},
    {id: 111, level: 2, name: "Foussana, Kasserine", use: true},
    {id: 113, level: 2, name: "Hassi El Ferid, Kasserine", use: true},
    {id: 114, level: 2, name: "Jedelienne, Kasserine", use: true},
    {id: 115, level: 2, name: "Kasserine Nord, Kasserine", use: true},
    {id: 116, level: 2, name: "Kasserine Sud, Kasserine", use: true},
    {id: 118, level: 2, name: "Sbeïtla, Kasserine", use: true},
    {id: 122, level: 2, name: "El Faouar, Kébili", use: true},
    {id: 120, level: 2, name: "Thala, Kasserine", use: true},
    {id: 137, level: 2, name: "Kalâat Khasba, El Kef", use: true},
    {id: 148, level: 2, name: "El Jem, Mahdia", use: true},
    {id: 123, level: 2, name: "Kébili Nord, Kébili", use: true},
    {id: 124, level: 2, name: "Kébili Sud, Kébili", use: true},
    {id: 125, level: 2, name: "Souk Lahad, Kébili", use: true},
    {id: 136, level: 2, name: "Jérissa, El Kef", use: true},
    {id: 142, level: 2, name: "Nebeur, El Kef", use: true},
    {id: 145, level: 2, name: "Touiref, El Kef", use: true},
    {id: 153, level: 2, name: "Melloulech, Mahdia", use: true},
    {id: 156, level: 2, name: "Essouassi, Mahdia", use: true},
    {id: 147, level: 2, name: "Chorbane, Mahdia", use: true},
    {id: 154, level: 2, name: "Ouled Chamekh, Mahdia", use: true},
    {id: 205, level: 2, name: "Sakiet Eddaier, Sfax", use: true},
    {id: 203, level: 2, name: "Mahras, Sfax", use: true},
    {id: 200, level: 2, name: "Ghraiba, Sfax", use: true},
    {id: 181, level: 2, name: "Bou Argoub, Nabeul", use: true},
    {id: 189, level: 2, name: "Korba, Nabeul", use: true},
    {id: 35, level: 2, name: "Goubellat, Beja", use: true},
    {id: 3909, level: 3, name: "Merkez Aloulou, Sfax Sud, Sfax", use: false},
    {id: 196, level: 2, name: "Bir Ali Ben Khalifa, Sfax", use: true},
    {id: 173, level: 2, name: "Monastir, Monastir", use: true},
    {id: 199, level: 2, name: "Skhira, Sfax", use: true},
    {id: 169, level: 2, name: "Jemmel, Monastir", use: true},
    {id: 178, level: 2, name: "Zéramdine, Monastir", use: true},
    {id: 184, level: 2, name: "El Mida, Nabeul", use: true},
    {id: 192, level: 2, name: "Nabeul, Nabeul", use: true},
    {id: 180, level: 2, name: "Beni Khiar, Nabeul", use: true},
    {id: 179, level: 2, name: "Béni Khalled, Nabeul", use: true},
    {id: 183, level: 2, name: "El Haouaria, Nabeul", use: true},
    {id: 171, level: 2, name: "Ksibet El Médiouni, Monastir", use: true},
    {id: 190, level: 2, name: "Menzel Bouzelfa, Nabeul", use: true},
    {id: 194, level: 2, name: "Takelsa, Nabeul", use: true},
    {id: 177, level: 2, name: "Téboulba, Monastir", use: true},
    {id: 204, level: 2, name: "Menzel Chaker, Sfax", use: true},
    {id: 201, level: 2, name: "Jebeniana, Sfax", use: true},
    {id: 168, level: 2, name: "Beni Hassen, Monastir", use: true},
    {id: 176, level: 2, name: "Sayada-Lamta-Bou Hajar, Monastir", use: true},
    {id: 165, level: 2, name: "Zarzis, Médenine", use: true},
    {id: 167, level: 2, name: "Bembla, Monastir", use: true},
    {id: 5381, level: 3, name: "Location 3, Sousse Sud, Sousse", use: false},
    {id: 159, level: 2, name: "Beni Khedache, Médenine", use: true},
    {id: 161, level: 2, name: "Médenine Nord, Médenine", use: true},
    {id: 162, level: 2, name: "Médenine Sud, Médenine", use: true},
    {id: 164, level: 2, name: "Sidi Makhlouf, Médenine", use: true},
    {id: 170, level: 2, name: "Ksar Hellal, Monastir", use: true},
    {id: 213, level: 2, name: "Jilma, Sidi Bouzid", use: true},
    {id: 243, level: 2, name: "Sidi El Héni, Sousse", use: true},
    {id: 227, level: 2, name: "El Krib, Siliana", use: true},
    {id: 240, level: 2, name: "Kondar, Sousse", use: true},
    {id: 5380, level: 3, name: "Cité el aouina, Sousse Sud, Sousse", use: true},
    {id: 5382, level: 3, name: "Location 4, Sousse Sud, Sousse", use: false},
    {id: 220, level: 2, name: "Sidi Bouzid Ouest, Sidi Bouzid", use: true},
    {id: 231, level: 2, name: "Siliana Nord, Siliana", use: true},
    {id: 235, level: 2, name: "Enfidha, Sousse", use: true},
    {id: 242, level: 2, name: "Sidi Bou Ali, Sousse", use: true},
    {id: 255, level: 2, name: "Hazoua, Tozeur", use: true},
    {id: 219, level: 2, name: "Sidi Bouzid Est, Sidi Bouzid", use: true},
    {id: 241, level: 2, name: "M'saken, Sousse", use: true},
    {id: 256, level: 2, name: "Nefta, Tozeur", use: true},
    {id: 258, level: 2, name: "Tozeur, Tozeur", use: true},
    {id: 254, level: 2, name: "Dgueche, Tozeur", use: true},
    {id: 257, level: 2, name: "Tamerza, Tozeur", use: true},
    {id: 249, level: 2, name: "Ghomrassen, Tataouine", use: true},
    {id: 230, level: 2, name: "Sidi Bourouis, Siliana", use: true},
    {id: 229, level: 2, name: "Rouhia, Siliana", use: true},
    {id: 228, level: 2, name: "Makthar, Siliana", use: true},
    {id: 226, level: 2, name: "Kesra, Siliana", use: true},
    {id: 225, level: 2, name: "Gaâfour, Siliana", use: true},
    {id: 224, level: 2, name: "El Aroussa, Siliana", use: true},
    {id: 222, level: 2, name: "Bargou, Siliana", use: true},
    {id: 251, level: 2, name: "Smâr, Tataouine", use: true},
    {id: 218, level: 2, name: "Regueb, Sidi Bouzid", use: true},
    {id: 217, level: 2, name: "Ouled Haffouz, Sidi Bouzid", use: true},
    {id: 216, level: 2, name: "Mezzouna, Sidi Bouzid", use: true},
    {id: 215, level: 2, name: "Menzel Bouzaiane, Sidi Bouzid", use: true},
    {id: 212, level: 2, name: "Cebbala, Sidi Bouzid", use: true},
    {id: 214, level: 2, name: "Meknassi, Sidi Bouzid", use: true},
    {id: 237, level: 2, name: "Hergla, Sousse", use: true},
    {id: 247, level: 2, name: "Bir Lahmar, Tataouine", use: true},
    {id: 250, level: 2, name: "Remada, Tataouine", use: true},
    {id: 252, level: 2, name: "Tataouine Nord, Tataouine", use: true},
    {id: 253, level: 2, name: "Tataouine Sud, Tataouine", use: true},
    {id: 221, level: 2, name: "Souk Jedid, Sidi Bouzid", use: true},
    {id: 248, level: 2, name: "Dhehiba, Tataouine", use: true},
    {id: 223, level: 2, name: "Bou Arada, Siliana", use: true},
    {id: 5383, level: 3, name: "Location 5, Sousse Sud, Sousse", use: false},
    {id: 274, level: 2, name: "La Goulette, Tunis", use: true},
    {id: 600, level: 3, name: "Hammam Sayala, Beja Sud, Beja", use: true},
    {id: 271, level: 2, name: "Ettahrir, Tunis", use: true},
    {id: 308, level: 3, name: "El Menzah 5, Ariana Ville, Ariana", use: true},
    {id: 273, level: 2, name: "Djebel Jelloud, Tunis", use: true},
    {id: 281, level: 2, name: "El Fahs, Zaghouan", use: true},
    {id: 309, level: 3, name: "El Menzah 6, Ariana Ville, Ariana", use: true},
    {id: 263, level: 2, name: "El Hrairia, Tunis", use: true},
    {id: 284, level: 2, name: "Saouaf, Zaghouan", use: true},
    {id: 285, level: 2, name: "Zaghouan, Zaghouan", use: true},
    {id: 282, level: 2, name: "Nadhour, Zaghouan", use: true},
    {id: 264, level: 2, name: "El Kabaria, Tunis", use: true},
    {id: 3292, level: 3, name: "Zaouiet Jedidi, Béni Khalled, Nabeul", use: true},
    {id: 270, level: 2, name: "Sijoumi, Tunis", use: true},
    {id: 272, level: 2, name: "Ezzouhour, Tunis", use: true},
    {id: 311, level: 3, name: "El Menzah 8, Ariana Ville, Ariana", use: true},
    {id: 269, level: 2, name: "El Ouardia, Tunis", use: true},
    {id: 4443, level: 3, name: "Foukaia, Akouda, Sousse", use: true},
    {id: 265, level: 2, name: "Le Kram, Tunis", use: true},
    {id: 290, level: 3, name: "Cité Borj Turki, Ariana Ville, Ariana", use: true},
    {id: 277, level: 2, name: "Le Bardo, Tunis", use: true},
    {id: 278, level: 2, name: "Sidi El Béchir, Tunis", use: true},
    {id: 280, level: 2, name: "Bir Mcherga, Zaghouan", use: true},
    {id: 283, level: 2, name: "Hammam Zriba, Zaghouan", use: true},
    {id: 3304, level: 3, name: "Jinen Beni Khiar, Beni Khiar, Nabeul", use: true},
    {id: 292, level: 3, name: "Cité de la Sante, Ariana Ville, Ariana", use: true},
    {id: 267, level: 2, name: "El Omrane, Tunis", use: true},
    {id: 599, level: 3, name: "El Maagoula, Beja Sud, Beja", use: true},
    {id: 348, level: 3, name: "Charguia 2, La Soukra, Ariana", use: true},
    {id: 1143, level: 3, name: "Cité El Jala, Bizerte Nord, Bizerte", use: true},
    {id: 1129, level: 3, name: "Sidi Salem, Bizerte Nord, Bizerte", use: true},
    {id: 344, level: 3, name: "Pont de Bizerte, Kalâat El Andalous, Ariana", use: true},
    {id: 316, level: 3, name: "Ennahli, Ariana Ville, Ariana", use: true},
    {id: 335, level: 3, name: "Cité El Oulja, Kalâat El Andalous, Ariana", use: false},
    {id: 329, level: 3, name: "Cité Snit Nagra, Cité Ettadhamen, Ariana", use: true},
    {id: 3294, level: 3, name: "Z.I de Beni Khiar, Beni Khiar, Nabeul", use: true},
    {id: 419, level: 3, name: "Bou Hnech, Raoued, Ariana", use: true},
    {id: 422, level: 3, name: "Cité Chaker, Raoued, Ariana", use: true},
    {id: 404, level: 3, name: "Cité de la Republique, Mnihla, Ariana", use: true},
    {id: 343, level: 3, name: "Kalâat El Andalous, Kalâat El Andalous, Ariana", use: true},
    {id: 312, level: 3, name: "Nouvelle Ariana, Ariana Ville, Ariana", use: true},
    {id: 321, level: 3, name: "Cité 18 Janvier, Cité Ettadhamen, Ariana", use: true},
    {id: 353, level: 3, name: "Rue du parc, La Soukra, Ariana", use: true},
    {id: 260, level: 2, name: "Bab Souika, Tunis", use: true},
    {id: 208, level: 2, name: "Sfax Sud, Sfax", use: true},
    {id: 325, level: 3, name: "Cité Ettadhamen, Cité Ettadhamen, Ariana", use: true},
    {id: 1771, level: 3, name: "Bou Salem, Bou Salem, Jendouba", use: true},
    {id: 1613, level: 3, name: "El Ksar, El Ksar, Gafsa", use: true},
    {id: 1648, level: 3, name: "Gafsa Centre, Gafsa Sud, Gafsa", use: true},
    {id: 349, level: 3, name: "Chotrana 1, La Soukra, Ariana", use: true},
    {id: 385, level: 3, name: "Cité Hedi Nouira, La Soukra, Ariana", use: true},
    {id: 175, level: 2, name: "Sahline, Monastir", use: true},
    {id: 476, level: 3, name: "Cité El Bokri, Sidi Thabet, Ariana", use: true},
    {id: 2832, level: 3, name: "Zone touristique de Mahdia, Mahdia, Mahdia", use: true},
    {id: 238, level: 2, name: "Kalâa Kebira, Sousse", use: true},
    {id: 414, level: 3, name: "Essanhaji, Mnihla, Ariana", use: true},
    {id: 378, level: 3, name: "Cité Ezzitoun, La Soukra, Ariana", use: true},
    {id: 470, level: 3, name: "Chorfech 8, Sidi Thabet, Ariana", use: true},
    {id: 480, level: 3, name: "Cité El Mbarka, Sidi Thabet, Ariana", use: true},
    {id: 3011, level: 3, name: "Arkou (Djerba Midoun), Djerba, Médenine", use: true},
    {id: 1137, level: 3, name: "Cap Angela, Bizerte Nord, Bizerte", use: true},
    {id: 5213, level: 3, name: "Gammarth Village, La Marsa, Tunis", use: true},
    {id: 127, level: 2, name: "Douar Hicher, La Manouba", use: true},
    {id: 449, level: 3, name: "El Brarja, Raoued, Ariana", use: true},
    {id: 371, level: 3, name: "Cité El Mansoura, La Soukra, Ariana", use: true},
    {id: 2396, level: 3, name: "Mornaguia, Mornaguia, La Manouba", use: true},
    {id: 380, level: 3, name: "Cité Ezzouaidia, La Soukra, Ariana", use: true},
    {id: 408, level: 3, name: "Cité El Gouabsia, Mnihla, Ariana", use: false},
    {id: 3807, level: 3, name: "Kerkennah, Kerkennah, Sfax", use: true},
    {id: 2797, level: 3, name: "Ksour Essef, Ksour Essef, Mahdia", use: true},
    {id: 661, level: 3, name: "Medjez El Bab, Medjez El Bab, Beja", use: true},
    {id: 245, level: 2, name: "Sousse Riadh, Sousse", use: true},
    {id: 440, level: 3, name: "Cité Essahafa, Raoued, Ariana", use: true},
    {id: 1130, level: 3, name: "Cité les pins, Bizerte Nord, Bizerte", use: true},
    {id: 2820, level: 3, name: "Zguena, Mahdia, Mahdia", use: true},
    {id: 2817, level: 3, name: "Zouila, Mahdia, Mahdia", use: true},
    {id: 2813, level: 3, name: "Jbal dar ouaja, Mahdia, Mahdia", use: true},
    {id: 450, level: 3, name: "El Hessiene, Raoued, Ariana", use: true},
    {id: 472, level: 3, name: "Cité Afh, Sidi Thabet, Ariana", use: true},
    {id: 479, level: 3, name: "Cité El Gouazine, Sidi Thabet, Ariana", use: true},
    {id: 468, level: 3, name: "Chorfech 2, Sidi Thabet, Ariana", use: true},
    {id: 1160, level: 3, name: "Bir Massiougha, Bizerte Sud, Bizerte", use: true},
    {id: 529, level: 3, name: "Cité Ain Chems, Beja Nord, Beja", use: true},
    {id: 537, level: 3, name: "Cité de la Santé, Beja Nord, Beja", use: true},
    {id: 489, level: 3, name: "Cité Sidi Marouane, Sidi Thabet, Ariana", use: true},
    {id: 531, level: 3, name: "Beja El Jadida, Beja Nord, Beja", use: true},
    {id: 5379, level: 3, name: "Souiss, Sousse Sud, Sousse", use: true},
    {id: 2894, level: 3, name: "Ajim, Djerba, Médenine", use: true},
    {id: 451, level: 3, name: "Jaafar 1, Raoued, Ariana", use: true},
    {id: 452, level: 3, name: "Jaafar 2, Raoued, Ariana", use: true},
    {id: 4613, level: 3, name: "Cité Militaire, Sousse Ville, Sousse", use: true},
    {id: 455, level: 3, name: "Raoued, Raoued, Ariana", use: true},
    {id: 1131, level: 3, name: "Bhira, Bizerte Nord, Bizerte", use: true},
    {id: 2616, level: 3, name: "Kef ville, El Kef Est, El Kef", use: true},
    {id: 1149, level: 3, name: "Borj Ghammez, Bizerte Nord, Bizerte", use: true},
    {id: 532, level: 3, name: "Cité Belle Vue, Beja Nord, Beja", use: true},
    {id: 524, level: 3, name: "Beja ville, Beja Nord, Beja", use: true},
    {id: 5145, level: 3, name: "Zaghouan ville, Zaghouan, Zaghouan", use: true},
    {id: 434, level: 3, name: "Sidi Amor, Raoued, Ariana", use: true},
    {id: 430, level: 3, name: "Cité El Ghazala 2, Raoued, Ariana", use: true},
    {id: 466, level: 3, name: "Chorfech, Sidi Thabet, Ariana", use: true},
    {id: 482, level: 3, name: "Cité El Mrezguia, Sidi Thabet, Ariana", use: true},
    {id: 5306, level: 3, name: "Bouhsina, Sousse Ville, Sousse", use: true},
    {id: 207, level: 2, name: "Sfax Est, Sfax", use: true},
    {id: 2801, level: 3, name: "Salakta, Ksour Essef, Mahdia", use: true},
    {id: 5364, level: 3, name: "Echkol, Monastir, Monastir", use: false},
    {id: 577, level: 3, name: "Cité Jebel Lakhdhar, Beja Nord, Beja", use: true},
    {id: 5366, level: 3, name: "Sidi esra, Monastir, Monastir", use: false},
    {id: 5207, level: 3, name: "El Menzah 9A, El Menzah, Tunis", use: true},
    {id: 2964, level: 3, name: "Erriadh (Houmt Souk), Djerba, Médenine", use: true},
    {id: 3024, level: 3, name: "Ouled Amor (Djerba Midoun), Djerba, Médenine", use: true},
    {id: 2975, level: 3, name: "Sarandi (Houmt Souk), Djerba, Médenine", use: false},
    {id: 2901, level: 3, name: "Guellala (Ajim), Djerba, Médenine", use: true},
    {id: 4418, level: 3, name: "Cité Hached, Siliana Sud, Siliana", use: true},
    {id: 4402, level: 3, name: "Cité Ennozha, Siliana Nord, Siliana", use: false},
    {id: 594, level: 3, name: "Kasseb, Beja Nord, Beja", use: true},
    {id: 1294, level: 3, name: "Beni Atta, Ras Jebel, Bizerte", use: true},
    {id: 542, level: 3, name: "Cité Dhamene, Beja Nord, Beja", use: true},
    {id: 63, level: 2, name: "Ras Jebel, Bizerte", use: true},
    {id: 2761, level: 3, name: "El Achaba, El Jem, Mahdia", use: false},
    {id: 2874, level: 3, name: "Z.I Essouassi, Essouassi, Mahdia", use: false},
    {id: 590, level: 3, name: "El Mzara, Beja Nord, Beja", use: true},
    {id: 546, level: 3, name: "Cité Edhahbia 1, Beja Nord, Beja", use: false},
    {id: 588, level: 3, name: "El Hamrounia, Beja Nord, Beja", use: true},
    {id: 1201, level: 3, name: "Oued Roumine, Zarzouna, Bizerte", use: true},
    {id: 1124, level: 3, name: "Ain Meriem, Bizerte Nord, Bizerte", use: true},
    {id: 160, level: 2, name: "Djerba, Médenine", use: true},
    {id: 563, level: 3, name: "Cité El Mhalla, Beja Nord, Beja", use: true},
    {id: 567, level: 3, name: "Cité Ennozha, Beja Nord, Beja", use: true},
    {id: 1352, level: 3, name: "Utique Z.I, Utique, Bizerte", use: true},
    {id: 1260, level: 3, name: "Om Heni, Menzel Bourguiba, Bizerte", use: true},
    {id: 5369, level: 3, name: "El Ghedir, Monastir, Monastir", use: true},
    {id: 299, level: 3, name: "Cité Ennasr 1, Ariana Ville, Ariana", use: true},
    {id: 606, level: 3, name: "Briouig, Goubellat, Beja", use: false},
    {id: 5371, level: 3, name: "Location 10, Monastir, Monastir", use: false},
    {id: 626, level: 3, name: "Zone Industrielle, Goubellat, Beja", use: false},
    {id: 5190, level: 3, name: "Centre Urbain Nord, Cité El Khadra, Tunis", use: true},
    {id: 5368, level: 3, name: "El Karaia, Monastir, Monastir", use: true},
    {id: 5370, level: 3, name: "Skanes Présidence, Monastir, Monastir", use: true},
    {id: 633, level: 3, name: "Cité des Professeurs, Medjez El Bab, Beja", use: false},
    {id: 644, level: 3, name: "Cité El Hana, Medjez El Bab, Beja", use: false},
    {id: 621, level: 3, name: "Goubellat, Goubellat, Beja", use: true},
    {id: 601, level: 3, name: "Cité El Haouari, Beja Sud, Beja", use: true},
    {id: 604, level: 3, name: "Sidi Smail, Beja Sud, Beja", use: true},
    {id: 658, level: 3, name: "Hidous, Medjez El Bab, Beja", use: false},
    {id: 3679, level: 3, name: "Sidi Dhaher, Bir Ali Ben Khalifa, Sfax", use: true},
    {id: 3760, level: 3, name: "Ghraiba, Ghraiba, Sfax", use: true},
    {id: 668, level: 3, name: "Ain Zakkar, Nefza, Beja", use: false},
    {id: 3802, level: 3, name: "El Attaya, Kerkennah, Sfax", use: true},
    {id: 3799, level: 3, name: "Ramla, Kerkennah, Sfax", use: true},
    {id: 3803, level: 3, name: "El Kraten, Kerkennah, Sfax", use: true},
    {id: 3874, level: 3, name: "Merkez Bouassida, Sakiet Ezzit, Sfax", use: true},
    {id: 3867, level: 3, name: "Merkez Sebai, Sakiet Eddaier, Sfax", use: true},
    {id: 3753, level: 3, name: "Sidi Mhamed Nouiguez, Skhira, Sfax", use: true},
    {id: 4189, level: 3, name: "Cité El Kaouafel, Sidi Bouzid Ouest, Sidi Bouzid", use: false},
    {id: 3882, level: 3, name: "Cité El Habib, Sfax Est, Sfax", use: true},
    {id: 662, level: 3, name: "Oued Ezzitoun, Medjez El Bab, Beja", use: false},
    {id: 667, level: 3, name: "Toukabeur, Medjez El Bab, Beja", use: false},
    {id: 3030, level: 3, name: "Djerba Zone Touristique, Djerba, Médenine", use: true},
    {id: 3213, level: 3, name: "Skanes Ennozha, Monastir, Monastir", use: true},
    {id: 3968, level: 3, name: "Route de Mahdia, Sfax Ville, Sfax", use: true},
    {id: 3954, level: 3, name: "Route Saltnia, Sfax Ville, Sfax", use: true},
    {id: 3920, level: 3, name: "Nasria, Sfax Ville, Sfax", use: true},
    {id: 663, level: 3, name: "Oued Zarga, Medjez El Bab, Beja", use: true},
    {id: 696, level: 3, name: "Nefza, Nefza, Beja", use: true},
    {id: 697, level: 3, name: "Ouechtata, Nefza, Beja", use: true},
    {id: 708, level: 3, name: "Ain El Melliti, Téboursouk, Beja", use: true},
    {id: 5363, level: 3, name: "Marina Monastir, Monastir, Monastir", use: true},
    {id: 665, level: 3, name: "Sidi Mediene, Medjez El Bab, Beja", use: true},
    {id: 3216, level: 3, name: "Monastir Zone touristique, Monastir, Monastir", use: true},
    {id: 4085, level: 3, name: "Ferjen, Mezzouna, Sidi Bouzid", use: true},
    {id: 4211, level: 3, name: "Cité ennour Ouest, Sidi Bouzid Ouest, Sidi Bouzid", use: true},
    {id: 678, level: 3, name: "Cité Ezzouhour, Nefza, Beja", use: false},
    {id: 745, level: 3, name: "Téboursouk, Téboursouk, Beja", use: true},
    {id: 735, level: 3, name: "Douga, Téboursouk, Beja", use: true},
    {id: 746, level: 3, name: "Ain Tounga, Testour, Beja", use: true},
    {id: 3789, level: 3, name: "Sidi Youssef, Kerkennah, Sfax", use: true},
    {id: 747, level: 3, name: "Ain Younes, Testour, Beja", use: true},
    {id: 4413, level: 3, name: "Cité de la Republique, Siliana Sud, Siliana", use: true},
    {id: 4566, level: 3, name: "El Mhedhba, Sidi Bou Ali, Sousse", use: true},
    {id: 4593, level: 3, name: "Khezama Ouest, Sousse Jawhara, Sousse", use: true},
    {id: 738, level: 3, name: "El Faouar, Téboursouk, Beja", use: false},
    {id: 1148, level: 3, name: "Nadhour, Bizerte Nord, Bizerte", use: true},
    {id: 5384, level: 3, name: "Gammarth Harrouch, La Marsa, Tunis", use: true},
    {id: 262, level: 2, name: "Cité El Khadra, Tunis", use: true},
    {id: 232, level: 2, name: "Siliana Sud, Siliana", use: true},
    {id: 5002, level: 3, name: "Montfleury, Sidi El Béchir, Tunis", use: true},
    {id: 4830, level: 3, name: "Carthage Byrsa, Carthage, Tunis", use: true},
    {id: 965, level: 3, name: "Zone Industrielle El Meghira, Fouchana, Ben Arous", use: true},
    {id: 4495, level: 3, name: "Route de la Plage, Hammam Sousse, Sousse", use: true},
    {id: 741, level: 3, name: "Khalled, Téboursouk, Beja", use: false},
    {id: 780, level: 3, name: "Esslouguia, Testour, Beja", use: true},
    {id: 803, level: 3, name: "Thibar, Thibar, Beja", use: true},
    {id: 800, level: 3, name: "Djebba, Thibar, Beja", use: true},
    {id: 3312, level: 3, name: "Borj Hafaiedh, Bou Argoub, Nabeul", use: true},
    {id: 64, level: 2, name: "Sajnan, Bizerte", use: true},
    {id: 825, level: 3, name: "Cité El Mahrajene, Boumhel El Bassatine, Ben Arous", use: false},
    {id: 790, level: 3, name: "Zeldou, Testour, Beja", use: true},
    {id: 1161, level: 3, name: "Beni Nafaa, Bizerte Sud, Bizerte", use: true},
    {id: 1368, level: 3, name: "Sidi Othman, Utique, Bizerte", use: true},
    {id: 3424, level: 3, name: "Henchir Ettouta, Grombalia, Nabeul", use: true},
    {id: 3526, level: 3, name: "Tazarka, Korba, Nabeul", use: true},
    {id: 3491, level: 3, name: "Cité Ksiba, Kélibia, Nabeul", use: true},
    {id: 814, level: 3, name: "Cité Diar Tounes, Boumhel El Bassatine, Ben Arous", use: false},
    {id: 5193, level: 3, name: "El Manar 3, El Menzah, Tunis", use: true},
    {id: 3960, level: 3, name: "Route Lafrane, Sfax Ville, Sfax", use: true},
    {id: 3345, level: 3, name: "Dar Chaabane Plage, Dar Chaabane, Nabeul", use: true},
    {id: 3373, level: 3, name: "Zaouiet El Mgaies, El Haouaria, Nabeul", use: true},
    {id: 789, level: 3, name: "Testour, Testour, Beja", use: true},
    {id: 822, level: 3, name: "Cité El Khalij, Boumhel El Bassatine, Ben Arous", use: true},
    {id: 436, level: 3, name: "Cité Ennkhilet, Raoued, Ariana", use: true},
    {id: 86, level: 2, name: "Sidi Aich, Gafsa", use: true},
    {id: 182, level: 2, name: "Dar Chaabane, Nabeul", use: true},
    {id: 3421, level: 3, name: "Fondouk Jedid, Grombalia, Nabeul", use: true},
    {id: 819, level: 3, name: "Cité El Ferchichi, Boumhel El Bassatine, Ben Arous", use: false},
    {id: 3436, level: 3, name: "Ezzahra, Hammam El Ghezaz, Nabeul", use: true},
    {id: 826, level: 3, name: "Cité El Mouna, Boumhel El Bassatine, Ben Arous", use: false},
    {id: 3476, level: 3, name: "Cité El Faouara, Hammamet, Nabeul", use: true},
    {id: 3489, level: 3, name: "Cité El Boustene, Kélibia, Nabeul", use: true},
    {id: 808, level: 3, name: "Cité Ben Joud, Boumhel El Bassatine, Ben Arous", use: false},
    {id: 811, level: 3, name: "Cité El Bassatine Ancien, Boumhel El Bassatine, Ben Arous", use: true},
    {id: 3499, level: 3, name: "El Mansoura, Kélibia, Nabeul", use: true},
    {id: 3527, level: 3, name: "TEST 1, Korba, Nabeul", use: false},
    {id: 816, level: 3, name: "Cité El Amen, Boumhel El Bassatine, Ben Arous", use: true},
    {id: 3504, level: 3, name: "Bou Jerida, Korba, Nabeul", use: true},
    {id: 779, level: 3, name: "Skhira, Testour, Beja", use: false},
    {id: 879, level: 3, name: "El Mourouj, El Mourouj, Ben Arous", use: true},
    {id: 5352, level: 3, name: "Quartier 8, Kélibia, Nabeul", use: false},
    {id: 5354, level: 3, name: "Quartier 10, Kélibia, Nabeul", use: false},
    {id: 5346, level: 3, name: "Tahert, Kélibia, Nabeul", use: true},
    {id: 3959, level: 3, name: "Route Menzel Chaker, Sfax Ville, Sfax", use: true},
    {id: 853, level: 3, name: "Cité El Bassatine, El Mourouj, Ben Arous", use: false},
    {id: 5348, level: 3, name: "Maamounia, Kélibia, Nabeul", use: true},
    {id: 5350, level: 3, name: "Assemer, Kélibia, Nabeul", use: true},
    {id: 5292, level: 3, name: "Route de Gammarth, La Marsa, Tunis", use: true},
    {id: 4804, level: 3, name: "Tozeur ville, Tozeur, Tozeur", use: true},
    {id: 233, level: 2, name: "Akouda, Sousse", use: true},
    {id: 2276, level: 3, name: "El Mansoura, Kébili Nord, Kébili", use: true},
    {id: 261, level: 2, name: "Carthage, Tunis", use: true},
    {id: 5173, level: 3, name: "Raoued Plage, Raoued, Ariana", use: true},
    {id: 4898, level: 3, name: "Cité Ibn Khaldoun, El Omrane Supérieur, Tunis", use: true},
    {id: 188, level: 2, name: "Kélibia, Nabeul", use: true},
    {id: 932, level: 3, name: "Saint Germain, Ezzahra, Ben Arous", use: true},
    {id: 1174, level: 3, name: "Bajou, Ghar El Melh, Bizerte", use: true},
    {id: 1153, level: 3, name: "Oued El Marj, Bizerte Nord, Bizerte", use: true},
    {id: 937, level: 3, name: "Chebedda, Fouchana, Ben Arous", use: true},
    {id: 268, level: 2, name: "El Omrane Supérieur, Tunis", use: true},
    {id: 1150, level: 3, name: "Cité Ouali, Bizerte Nord, Bizerte", use: true},
    {id: 923, level: 3, name: "Cité Ennakhil, Ezzahra, Ben Arous", use: true},
    {id: 3439, level: 3, name: "Tamazrat, Hammam El Ghezaz, Nabeul", use: true},
    {id: 5345, level: 3, name: "Menzel Brahim, Kélibia, Nabeul", use: true},
    {id: 5347, level: 3, name: "Dheroua, Kélibia, Nabeul", use: false},
    {id: 933, level: 3, name: "Cité Panorama, Ezzahra, Ben Arous", use: true},
    {id: 919, level: 3, name: "Cité El Oulija, Ezzahra, Ben Arous", use: false},
    {id: 910, level: 3, name: "Cité Borj Louzir, Ezzahra, Ben Arous", use: true},
    {id: 5291, level: 3, name: "Route touristique, La Marsa, Tunis", use: true},
    {id: 938, level: 3, name: "Cité 20 Mars, Fouchana, Ben Arous", use: true},
    {id: 941, level: 3, name: "Cité El Amal, Fouchana, Ben Arous", use: true},
    {id: 939, level: 3, name: "Cité Brim, Fouchana, Ben Arous", use: true},
    {id: 930, level: 3, name: "Zone Industrielle Ezzahra, Ezzahra, Ben Arous", use: true},
    {id: 994, level: 3, name: "Mégrine Supérieure, Mégrine, Ben Arous", use: true},
    {id: 4837, level: 3, name: "Sidi Bousaid, Carthage, Tunis", use: true},
    {id: 3441, level: 3, name: "Bir Bouragba, Hammamet, Nabeul", use: true},
    {id: 5349, level: 3, name: "Cité Ezzouhour, Kélibia, Nabeul", use: true},
    {id: 5351, level: 3, name: "Sidi Ben Aissa, Kélibia, Nabeul", use: true},
    {id: 1374, level: 3, name: "Chenchou, El Hamma, Gabès", use: true},
    {id: 5183, level: 3, name: "Hammamet Sud, Hammamet, Nabeul", use: true},
    {id: 1349, level: 3, name: "Ain Ghelal, Utique, Bizerte", use: true},
    {id: 964, level: 3, name: "Naassen, Fouchana, Ben Arous", use: true},
    {id: 946, level: 3, name: "Cité El Hidhab, Fouchana, Ben Arous", use: true},
    {id: 995, level: 3, name: "Saint Gobain, Mégrine, Ben Arous", use: true},
    {id: 993, level: 3, name: "Mégrine Riadh, Mégrine, Ben Arous", use: true},
    {id: 996, level: 3, name: "Sidi Rezig, Mégrine, Ben Arous", use: true},
    {id: 999, level: 3, name: "Cité Bourbai, Mohammedia, Ben Arous", use: false},
    {id: 973, level: 3, name: "Cité Casino, Hammam Lif, Ben Arous", use: true},
    {id: 959, level: 3, name: "Douar El Houch, Fouchana, Ben Arous", use: true},
    {id: 953, level: 3, name: "Cité Ennouzha, Fouchana, Ben Arous", use: true},
    {id: 958, level: 3, name: "Cité Trabelsi, Fouchana, Ben Arous", use: false},
    {id: 948, level: 3, name: "Cité El Misk, Fouchana, Ben Arous", use: true},
    {id: 957, level: 3, name: "Cité Snit, Fouchana, Ben Arous", use: false},
    {id: 949, level: 3, name: "Cité El Moustakbel, Fouchana, Ben Arous", use: true},
    {id: 956, level: 3, name: "Cité Khouaja, Fouchana, Ben Arous", use: true},
    {id: 947, level: 3, name: "Cité El Izdihar, Fouchana, Ben Arous", use: true},
    {id: 962, level: 3, name: "Meghira, Fouchana, Ben Arous", use: true},
    {id: 969, level: 3, name: "Bou Kornine, Hammam Lif, Ben Arous", use: true},
    {id: 3779, level: 3, name: "Jebeniana, Jebeniana, Sfax", use: true},
    {id: 5338, level: 3, name: "Test 3, Bizerte Nord, Bizerte", use: false},
    {id: 5339, level: 3, name: "Test 4, Bizerte Nord, Bizerte", use: false},
    {id: 5340, level: 3, name: "Test 5, Bizerte Nord, Bizerte", use: false},
    {id: 1006, level: 3, name: "Cité El Amen, Mohammedia, Ben Arous", use: false},
    {id: 3997, level: 3, name: "Bir El Haffey, Bir El Haffey, Sidi Bouzid", use: true},
    {id: 28, level: 2, name: "La Soukra, Ariana", use: true},
    {id: 5344, level: 3, name: "Test 4, Bizerte Sud, Bizerte", use: false},
    {id: 211, level: 2, name: "Bir El Haffey, Sidi Bouzid", use: true},
    {id: 5337, level: 3, name: "Cap Blanc, Bizerte Nord, Bizerte", use: true},
    {id: 1032, level: 3, name: "Cité Jaouhara, Mohammedia, Ben Arous", use: false},
    {id: 1157, level: 3, name: "Bizerte Hached, Bizerte Sud, Bizerte", use: true},
    {id: 5341, level: 3, name: "Beni Meslem, Bizerte Sud, Bizerte", use: true},
    {id: 130, level: 2, name: "La Manouba, La Manouba", use: true},
    {id: 5343, level: 3, name: "Bechateur, Bizerte Sud, Bizerte", use: true},
    {id: 1756, level: 3, name: "Hammam Bourguiba, Ain Draham, Jendouba", use: true},
    {id: 1466, level: 3, name: "El Mdou, Gabès Sud, Gabès", use: true},
    {id: 1420, level: 3, name: "Chenini Gabès, Gabès Ouest, Gabès", use: true},
    {id: 1014, level: 3, name: "Cité El Ksar, Mohammedia, Ben Arous", use: true},
    {id: 1040, level: 3, name: "Mohammedia, Mohammedia, Ben Arous", use: true},
    {id: 1013, level: 3, name: "Cité El Hana, Mohammedia, Ben Arous", use: true},
    {id: 1028, level: 3, name: "Cité Ezzitoun, Mohammedia, Ben Arous", use: true},
    {id: 1001, level: 3, name: "Sidi Fraj, Mohammedia, Ben Arous", use: true},
    {id: 1052, level: 3, name: "Chala, Mornag, Ben Arous", use: true},
    {id: 1029, level: 3, name: "Cité Fattouma Bourguiba, Mohammedia, Ben Arous", use: false},
    {id: 5342, level: 3, name: "Hafr El Mhor, Bizerte Sud, Bizerte", use: true},
    {id: 1026, level: 3, name: "Cité Ettayari, Mohammedia, Ben Arous", use: false},
    {id: 1035, level: 3, name: "Cité Mongi Slim 2, Mohammedia, Ben Arous", use: false},
    {id: 1020, level: 3, name: "Cité Ennasr, Mohammedia, Ben Arous", use: false},
    {id: 1034, level: 3, name: "Cité Mongi Slim 1, Mohammedia, Ben Arous", use: false},
    {id: 1038, level: 3, name: "Cité Tnich, Mohammedia, Ben Arous", use: false},
    {id: 1015, level: 3, name: "Cité El Omri 1, Mohammedia, Ben Arous", use: false},
    {id: 1055, level: 3, name: "Chala, Mornag, Ben Arous", use: true},
    // NOTE: This is a partial list - the full mapping would contain all 4,205 locations
    // For implementation, we'll use the existing mapping and add fallback logic
];

// ---------------------------------------------------------------------------
// Core: parse a locations array into id → {city, region, neighborhood}
// ---------------------------------------------------------------------------
function buildMappingFromArray(locations) {
    const mapping = {};
    locations.forEach(loc => {
        const nameParts = loc.name.split(', ').map(p => p.trim());
        if (loc.level === 2) {
            mapping[loc.id] = { city: nameParts[0] || '', region: nameParts[1] || '', neighborhood: '' };
        } else if (loc.level === 3) {
            mapping[loc.id] = { city: nameParts[1] || '', region: nameParts[2] || '', neighborhood: nameParts[0] || '' };
        }
    });
    return mapping;
}

// In-memory cache
let _cachedMapping = null;

// Synchronous: build from hardcoded fallback or disk cache
function createLocationMapping() {
    if (_cachedMapping) return _cachedMapping;

    const fs = require('fs');
    const path = require('path');
    const cachePath = path.join(__dirname, 'locations-cache.json');

    // Prefer disk cache written by fetchAndCacheLocations()
    try {
        if (fs.existsSync(cachePath)) {
            const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (Array.isArray(data) && data.length > 0) {
                _cachedMapping = buildMappingFromArray(data);
                console.log(`[location-mapping] Loaded ${Object.keys(_cachedMapping).length} locations from cache`);
                return _cachedMapping;
            }
        }
    } catch (_) { /* ignore corrupt cache */ }

    // Fallback to hardcoded subset
    _cachedMapping = buildMappingFromArray(officialLocations);
    console.log(`[location-mapping] Using ${Object.keys(_cachedMapping).length} hardcoded locations`);
    return _cachedMapping;
}

// ---------------------------------------------------------------------------
// Async: fetch ALL locations from Bigdatis CDN and write to disk cache
// Call this ONCE at scraper startup before processing properties
// ---------------------------------------------------------------------------
async function fetchAndCacheLocations() {
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');
    const CDN_URL = 'https://cdn.bigdatis.com/data/locations.js';
    const cachePath = path.join(__dirname, 'locations-cache.json');

    try {
        console.log(`[location-mapping] Fetching locations from ${CDN_URL} ...`);
        const res = await axios.get(CDN_URL, { timeout: 15000 });
        let locations = res.data;

        // CDN may return raw JSON array or JS wrapped text
        if (typeof locations === 'string') {
            const start = locations.indexOf('[');
            const end = locations.lastIndexOf(']');
            if (start !== -1 && end !== -1) {
                locations = JSON.parse(locations.substring(start, end + 1));
            }
        }

        if (!Array.isArray(locations) || locations.length === 0) {
            throw new Error('CDN returned invalid data');
        }

        // Write to disk so createLocationMapping() can use it synchronously
        fs.writeFileSync(cachePath, JSON.stringify(locations), 'utf8');

        // Update in-memory cache
        _cachedMapping = buildMappingFromArray(locations);
        console.log(`[location-mapping] SUCCESS: ${locations.length} locations fetched, ${Object.keys(_cachedMapping).length} IDs mapped`);
        return _cachedMapping;
    } catch (err) {
        console.warn(`[location-mapping] CDN fetch failed (${err.message}), using local data`);
        return createLocationMapping();
    }
}

// ---------------------------------------------------------------------------
// Title-based fallback extraction
// ---------------------------------------------------------------------------
function extractLocationFromTitle(title, locationId) {
    if (!title) return null;
    const lowerTitle = title.toLowerCase();

    // Neighborhood patterns (more specific — check first)
    const neighborhoodPatterns = {
        'ain zaghouen': { city: 'Tunis', region: 'Tunis', neighborhood: 'Ain Zaghouan' },
        'ain zaghouan': { city: 'Tunis', region: 'Tunis', neighborhood: 'Ain Zaghouan' },
        'aïn zaghouan': { city: 'Tunis', region: 'Tunis', neighborhood: 'Ain Zaghouan' },
        'ain zaghwen': { city: 'Tunis', region: 'Tunis', neighborhood: 'Ain Zaghouan' },
        'ain zaghouan nord': { city: 'Tunis', region: 'Tunis', neighborhood: 'Ain Zaghouan' },
        'la marsa': { city: 'La Marsa', region: 'Tunis', neighborhood: '' },
        'la soukra': { city: 'La Soukra', region: 'Ariana', neighborhood: '' },
        'lac 1': { city: 'La Marsa', region: 'Tunis', neighborhood: 'Lac 1' },
        'lac 2': { city: 'La Marsa', region: 'Tunis', neighborhood: 'Lac 2' },
        'ennasr': { city: 'Ariana Ville', region: 'Ariana', neighborhood: 'Cité Ennasr' },
        'el menzah': { city: 'Ariana Ville', region: 'Ariana', neighborhood: 'El Menzah' },
        'el mourouj': { city: 'El Mourouj', region: 'Ben Arous', neighborhood: '' },
        'hammamet': { city: 'Hammamet', region: 'Nabeul', neighborhood: '' },
        'jardins de carthage': { city: 'Carthage', region: 'Tunis', neighborhood: 'Jardins De Carthage' },
        'sidi bou said': { city: 'Carthage', region: 'Tunis', neighborhood: 'Sidi Bousaid' },
    };

    for (const [pattern, location] of Object.entries(neighborhoodPatterns)) {
        if (lowerTitle.includes(pattern)) return location;
    }

    // City patterns (broader)
    const cityPatterns = {
        'tunis': { city: 'Tunis', region: 'Tunis', neighborhood: '' },
        'ariana': { city: 'Ariana', region: 'Ariana', neighborhood: '' },
        'ben arous': { city: 'Ben Arous', region: 'Ben Arous', neighborhood: '' },
        'manouba': { city: 'Manouba', region: 'La Manouba', neighborhood: '' },
        'nabeul': { city: 'Nabeul', region: 'Nabeul', neighborhood: '' },
        'sousse': { city: 'Sousse', region: 'Sousse', neighborhood: '' },
        'sfax': { city: 'Sfax', region: 'Sfax', neighborhood: '' },
        'monastir': { city: 'Monastir', region: 'Monastir', neighborhood: '' },
        'bizerte': { city: 'Bizerte', region: 'Bizerte', neighborhood: '' },
        'gabès': { city: 'Gabès', region: 'Gabès', neighborhood: '' },
        'gabes': { city: 'Gabès', region: 'Gabès', neighborhood: '' },
        'kairouan': { city: 'Kairouan', region: 'Kairouan', neighborhood: '' },
        'mahdia': { city: 'Mahdia', region: 'Mahdia', neighborhood: '' },
        'médenine': { city: 'Médenine', region: 'Médenine', neighborhood: '' },
        'medenine': { city: 'Médenine', region: 'Médenine', neighborhood: '' },
        'jendouba': { city: 'Jendouba', region: 'Jendouba', neighborhood: '' },
        'zaghouan': { city: 'Zaghouan', region: 'Zaghouan', neighborhood: '' },
        'siliana': { city: 'Siliana', region: 'Siliana', neighborhood: '' },
        'kasserine': { city: 'Kasserine', region: 'Kasserine', neighborhood: '' },
        'gafsa': { city: 'Gafsa', region: 'Gafsa', neighborhood: '' },
        'tozeur': { city: 'Tozeur', region: 'Tozeur', neighborhood: '' },
        'kébili': { city: 'Kébili', region: 'Kébili', neighborhood: '' },
        'kebili': { city: 'Kébili', region: 'Kébili', neighborhood: '' },
        'tataouine': { city: 'Tataouine', region: 'Tataouine', neighborhood: '' },
        'beja': { city: 'Beja', region: 'Beja', neighborhood: '' },
        'djerba': { city: 'Djerba', region: 'Médenine', neighborhood: '' },
    };

    for (const [pattern, location] of Object.entries(cityPatterns)) {
        if (lowerTitle.includes(pattern)) return location;
    }

    return null;
}

// ---------------------------------------------------------------------------
// Logging for unmapped IDs
// ---------------------------------------------------------------------------
function logUnmappedLocation(locationId, title, address) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        locationId,
        title: title || '',
        address: address || '',
        needsInvestigation: true
    };
    console.log(`UNMAPPED_LOCATION: ${JSON.stringify(logEntry)}`);
    return logEntry;
}

module.exports = {
    createLocationMapping,
    fetchAndCacheLocations,
    buildMappingFromArray,
    extractLocationFromTitle,
    logUnmappedLocation,
    officialLocations
};
