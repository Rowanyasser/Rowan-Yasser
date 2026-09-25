class GiftGuideGrid{
    /* Handle differs from the title: "Soft Winter Jacket" lives at dark-winter-jacket. */
    static BONUS_HANDLE = 'dark-winter-jacket';
    static BONUS_WHEN = {color: 'black', size: 'm'};

    constructor(root) {
        this.root = root;
        this.popup = root.querySelector('[data-gg-popup]');
        this.optionsHost = this.popup.querySelector('[data-gg-options]');
        this.message = this.popup.querySelector('[data-gg-message]');
        this.submit = this.popup.querySelector('.gg-popup__submit');
        this.currency = root.dataset.currency || 'USD';
        this.product = null;
        this.lastFocused=null;

        root.querySelectorAll('.gg-grid__hotspot').forEach((button) => {
            button.addEventListener('click', () => {
                this.open(button.dataset.productHandle, button);
                
            });
        });
        this.popup.querySelectorAll('[data-gg-close]').forEach((element) => {
            element.addEventListener('click', () => {
                this.close();
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !this.popup.hidden) {
                this.close();
            }
        });

        this.popup.querySelector('[data-gg-form]').addEventListener('submit', (event) => {this.addToCart(event)});



    }

    open(handle, trigger) {
        const node = this.root.querySelector(`[data-gg-product="${handle}"]`);
        if(!node) return;
        this.product = JSON.parse(node.textContent);
        this.lastFocused=trigger;
        this.popup.querySelector('.gg-popup__title').textContent = this.product.title;
        this.popup.querySelector('.gg-popup__description').innerHTML = this.product.description;

        const image = this.popup.querySelector('.gg-popup__image');
        image.src = this.product.featured_image || '';
        image.alt = this.product.title;

        this.renderOptions();
        this.refreshPrice();
        this.submit.disabled = false;
        this.popup.hidden = false;
        document.body.style.overflow = 'hidden';
        this.popup.querySelector('.gg-popup__close').focus();

    }
    close() {
        this.popup.hidden = true;
        this.message.textContent = '';
        document.body.style.overflow = '';
        if(this.lastFocused) this.lastFocused.focus();

    }

    /*any product with any set of options should render correctly*/
    renderOptions() {
        this.optionsHost.innerHTML = '';
        this.product.options.forEach((name, index) => {
            const values = [...new Set(this.product.variants.map((v) => v.options[index]))];
            const field=document.createElement('div');
            field.classList.add('gg-popup__option');
            const label=document.createElement('span');
            label.textContent=name;
            label.className='gg-popup__option-name';
            field.appendChild(label);
            field.appendChild(name.toLowerCase() === 'color' ? this.buildSwatches(name,values) : this.buildSelect(name,values));
            this.optionsHost.appendChild(field);
        });

    }
    buildSwatches(name, values) {
        const group = document.createElement('div');
        group.className = 'gg-popup__swatches';
        group.dataset.optionName = name;
        values.forEach((value,index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'gg-popup__swatch';
            button.textContent = value;
            button.dataset.value= value;
            button.setAttribute('aria-pressed', String(index === 0));
            button.addEventListener('click', () => {
                group.querySelectorAll('.gg-popup__swatch').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
                this.refreshPrice();
            });
            group.appendChild(button);
        });
        return group;

    }
    buildSelect(name, values) {
        const select = document.createElement('select');
        select.className = 'gg-popup__select';
        select.dataset.optionName = name;
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = `Choose your ${name.toLowerCase()}`;
        select.appendChild(placeholder);
        values.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
        select.addEventListener('change', () => {
            this.refreshPrice();
        });
        return select;
    }
    selection(){
        const chosen = {};
        this.optionsHost.querySelectorAll('[data-option-name]').forEach((control) => {
            const name = control.dataset.optionName;
            chosen[name] = control.tagName === 'SELECT' ? control.value : control.querySelector('[aria-pressed="true"]')?.dataset.value || '';
            
        });
        return chosen;
    }

    matchVariant() {
        const chosen = this.selection();
        return this.product.variants.find((v) => {
            return this.product.options.every((name, index) => v.options[index] === chosen[name]);
        }) || null;

    }
    refreshPrice() {
        const variant = this.matchVariant();
        this.popup.querySelector('.gg-popup__price').textContent = this.money(variant ? variant.price : this.product.price);
        this.message.textContent = '';
    }

    /*prices returned from Shopify are in cents, so we need to divide by 100 and format as currency*/
    money(cents) {
        return new Intl.NumberFormat(document.documentElement.lang || 'en', {style: 'currency', currency: this.currency}).format(cents/100);}

    async addToCart(event) {
        event.preventDefault();
        const variant = this.matchVariant();
        if(!variant) {
            this.message.textContent = 'Please choose every option.';
            return;
        }
        this.submit.disabled = true;
        this.message.textContent = 'Adding to cart...';
        const items = [{id: variant.id, quantity: 1}];
        const bonus = await this.bonusItem();
        if (bonus) items.push(bonus);

        try{
            const response = await fetch('/cart/add.js', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({items}),
            });
            if(!response.ok) throw new Error(await response.text());
            this.message.textContent = bonus ? `Added along with the Soft Winter Jacket` : 'Added to cart.';
            this.updateCartCount();
        } catch (error) {
            this.message.textContent = 'That could not be added to the cart.';
            console.error(error);}
            finally {
                this.submit.disabled = false;
            }
        }
        async bonusItem() {
            if(this.product.handle === GiftGuideGrid.BONUS_HANDLE) return null;
            const chosen= {};
            Object.entries(this.selection()).forEach(([name,value]) => {
                chosen[name.toLowerCase()] = String(value).toLowerCase();
            });
            const triggered = Object.entries(GiftGuideGrid.BONUS_WHEN).every(([name,value]) => chosen[name] === value);
            if(!triggered) return null;
            try {
                const response = await fetch(`/products/${GiftGuideGrid.BONUS_HANDLE}.js`);
                if(!response.ok) return null;
                const product = await response.json();
                const variant = product.variants.find((v) => v.available) || product.variants[0];
                return variant ? {id: variant.id, quantity: 1} : null;
            } catch  {
                return null;
            }
        }
        async updateCartCount() {
            try{
                const cart = await (await fetch('/cart.js')).json();
                document.querySelectorAll('.cart-count-bubble span[aria-hidden="true"]').forEach((node) => {
                    node.textContent = cart.item_count;
                });
            } catch (error) {
                console.error(error);
            }
        }
    }
document.querySelectorAll('.gg-grid').forEach((section) => new GiftGuideGrid(section));
    
