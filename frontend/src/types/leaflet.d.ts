/**
 * Tipagem mínima do Leaflet carregado via CDN (script tag no index.html).
 * Evita adicionar a dependência npm e o peso do build.
 */
declare namespace L {
    interface MapOptions {
        zoomControl?: boolean;
        attributionControl?: boolean;
        center?: [number, number];
        zoom?: number;
    }

    interface TileLayerOptions {
        maxZoom?: number;
        attribution?: string;
    }

    interface MarkerOptions {
        icon?: any;
    }

    interface DivIconOptions {
        className?: string;
        html?: string;
        iconSize?: [number, number];
        iconAnchor?: [number, number];
    }

    interface Layer {
        addTo(map: Map): Layer;
        remove(): void;
        bindPopup(content: string): Layer;
        on(event: string, handler: () => void): Layer;
        setLatLng(latlng: [number, number]): void;
    }

    interface Map {
        removeLayer(layer: Layer): void;
        setView(center: [number, number], zoom?: number): Map;
        fitBounds(bounds: [number, number][] | any, options?: any): Map;
    }

    function map(element: HTMLElement, options?: MapOptions): Map;
    function tileLayer(url: string, options?: TileLayerOptions): Layer;
    function polyline(latlngs: [number, number][], options?: any): Layer;
    function marker(latlng: [number, number], options?: MarkerOptions): Layer;
    function divIcon(options: DivIconOptions): any;
}

interface Window {
    L?: typeof L;
}
